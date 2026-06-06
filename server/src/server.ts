import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import { generatePassage, QuotaError } from "./gemini.js";
import {
  addHistory,
  addWords,
  createUser,
  deleteHistory,
  getHistory,
  getStats,
  getUserByEmail,
  getUserById,
  getWordsByIds,
  listWords,
  recordSeen,
  removeWord,
  reviewWord,
  selectWordsForPassage,
} from "./store.js";
import {
  type AuthedRequest,
  clearSessionCookie,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from "./auth.js";
import type { Difficulty, Length, ReviewResult, TextFormat } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const app = express();
app.use(express.json());
app.use(cookieParser());

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const LENGTHS: Length[] = ["short", "medium", "long"];
const FORMATS: TextFormat[] = ["sentences", "paragraphs", "story", "conversation", "custom"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// ---- Auth ----

app.post("/api/auth/register", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  if (getUserByEmail(email)) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }
  const user = createUser(email, await hashPassword(password));
  setSessionCookie(res, user.id);
  res.json({ user: { id: user.id, email: user.email } });
});

app.post("/api/auth/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const user = getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Incorrect email or password." });
    return;
  }
  setSessionCookie(res, user.id);
  res.json({ user: { id: user.id, email: user.email } });
});

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const userId = (req as AuthedRequest).userId!;
  const user = getUserById(userId);
  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Account no longer exists." });
    return;
  }
  res.json({ user: { id: user.id, email: user.email } });
});

// ---- Words (all require auth) ----

app.get("/api/words", requireAuth, (req, res) => {
  res.json({ words: listWords(uid(req)) });
});

app.get("/api/stats", requireAuth, (req, res) => {
  res.json(getStats(uid(req)));
});

app.post("/api/words", requireAuth, (req, res) => {
  const raw = typeof req.body?.text === "string" ? req.body.text : "";
  if (!raw.trim()) {
    res.status(400).json({ error: "Provide one or more words in `text`." });
    return;
  }
  const added = addWords(uid(req), raw);
  res.json({ added, words: listWords(uid(req)) });
});

app.delete("/api/words/:id", requireAuth, (req, res) => {
  if (!removeWord(uid(req), req.params.id)) {
    res.status(404).json({ error: "Word not found." });
    return;
  }
  res.json({ words: listWords(uid(req)) });
});

app.post("/api/words/:id/review", requireAuth, (req, res) => {
  const result = req.body?.result as ReviewResult;
  if (result !== "got_it" && result !== "still_learning") {
    res.status(400).json({ error: "`result` must be 'got_it' or 'still_learning'." });
    return;
  }
  const word = reviewWord(uid(req), req.params.id, result);
  if (!word) {
    res.status(404).json({ error: "Word not found." });
    return;
  }
  res.json({ word, words: listWords(uid(req)) });
});

// ---- History (all require auth) ----

app.get("/api/history", requireAuth, (req, res) => {
  res.json({ history: getHistory(uid(req)) });
});

app.delete("/api/history/:id", requireAuth, (req, res) => {
  if (!deleteHistory(uid(req), req.params.id)) {
    res.status(404).json({ error: "History entry not found." });
    return;
  }
  res.json({ history: getHistory(uid(req)) });
});

// ---- Generate (requires auth + the caller's own Gemini key) ----

app.post("/api/generate", requireAuth, async (req, res) => {
  const userId = uid(req);
  const apiKey = typeof req.headers["x-gemini-key"] === "string" ? req.headers["x-gemini-key"] : "";
  if (!apiKey.trim()) {
    res.status(400).json({ error: "Add your Gemini API key in Settings first." });
    return;
  }

  try {
    const count = clampInt(req.body?.count, 1, 15, 5);
    const difficulty: Difficulty = DIFFICULTIES.includes(req.body?.difficulty)
      ? req.body.difficulty
      : "medium";
    const length: Length = LENGTHS.includes(req.body?.length) ? req.body.length : "medium";
    const theme = typeof req.body?.theme === "string" ? req.body.theme : undefined;
    const format: TextFormat = FORMATS.includes(req.body?.format) ? req.body.format : "paragraphs";
    const customType = typeof req.body?.customType === "string" ? req.body.customType : undefined;
    const dueOnly = req.body?.dueOnly === true;
    const wordIds: string[] = Array.isArray(req.body?.wordIds)
      ? req.body.wordIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    // Explicit selection wins; otherwise fall back to spaced-repetition pick.
    let selected;
    if (wordIds.length > 0) {
      selected = getWordsByIds(userId, wordIds);
      if (selected.length === 0) {
        res.status(400).json({ error: "None of the selected words were found." });
        return;
      }
    } else {
      selected = selectWordsForPassage(userId, count, { dueOnly });
      if (selected.length === 0) {
        res.status(400).json({
          error: dueOnly ? "No words are due for review right now." : "Add some words first.",
        });
        return;
      }
    }

    const passage = await generatePassage(
      apiKey.trim(),
      selected.map((w) => w.text),
      { difficulty, length, theme, format, customType },
    );

    recordSeen(userId, selected.map((w) => w.id));

    const entry = addHistory(userId, {
      title: passage.title,
      passage: passage.passage,
      glossary: passage.glossary,
      words: selected,
    });
    res.json(entry);
  } catch (err) {
    if (err instanceof QuotaError) {
      res.status(429).json({ error: err.message, retryAfterSeconds: err.retryAfterSeconds });
      return;
    }
    console.error("Generation failed:", err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to generate a passage.",
    });
  }
});

function uid(req: express.Request): string {
  return (req as AuthedRequest).userId!;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`🟢 Vocabulary Immersion API listening on http://localhost:${port}`);
});
