import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import express from "express";
import { generatePassage } from "./gemini.js";
import {
  addHistory,
  addWords,
  deleteHistory,
  getHistory,
  getStats,
  getWordsByIds,
  listWords,
  recordSeen,
  removeWord,
  reviewWord,
  selectWordsForPassage,
} from "./store.js";
import type { Difficulty, Length, ReviewResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "\n⚠️  GEMINI_API_KEY is not set. Copy .env.example to .env and add your key\n   (get one free at https://aistudio.google.com/apikey), otherwise generation will fail.\n",
  );
}

const app = express();
app.use(express.json());

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const LENGTHS: Length[] = ["short", "medium", "long"];

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.GEMINI_API_KEY) });
});

app.get("/api/words", (_req, res) => {
  res.json({ words: listWords() });
});

app.get("/api/stats", (_req, res) => {
  res.json(getStats());
});

app.get("/api/history", (_req, res) => {
  res.json({ history: getHistory() });
});

app.delete("/api/history/:id", (req, res) => {
  const removed = deleteHistory(req.params.id);
  if (!removed) {
    res.status(404).json({ error: "History entry not found." });
    return;
  }
  res.json({ history: getHistory() });
});

app.post("/api/words", (req, res) => {
  const raw = typeof req.body?.text === "string" ? req.body.text : "";
  if (!raw.trim()) {
    res.status(400).json({ error: "Provide one or more words in `text`." });
    return;
  }
  const added = addWords(raw);
  res.json({ added, words: listWords() });
});

app.delete("/api/words/:id", (req, res) => {
  const removed = removeWord(req.params.id);
  if (!removed) {
    res.status(404).json({ error: "Word not found." });
    return;
  }
  res.json({ words: listWords() });
});

app.post("/api/words/:id/review", (req, res) => {
  const result = req.body?.result as ReviewResult;
  if (result !== "got_it" && result !== "still_learning") {
    res.status(400).json({ error: "`result` must be 'got_it' or 'still_learning'." });
    return;
  }
  const word = reviewWord(req.params.id, result);
  if (!word) {
    res.status(404).json({ error: "Word not found." });
    return;
  }
  res.json({ word, words: listWords() });
});

app.post("/api/generate", async (req, res) => {
  try {
    const count = clampInt(req.body?.count, 1, 15, 5);
    const difficulty: Difficulty = DIFFICULTIES.includes(req.body?.difficulty)
      ? req.body.difficulty
      : "medium";
    const length: Length = LENGTHS.includes(req.body?.length) ? req.body.length : "medium";
    const theme = typeof req.body?.theme === "string" ? req.body.theme : undefined;
    const dueOnly = req.body?.dueOnly === true;
    const wordIds: string[] = Array.isArray(req.body?.wordIds)
      ? req.body.wordIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    // Explicit selection wins; otherwise fall back to spaced-repetition pick.
    let selected;
    if (wordIds.length > 0) {
      selected = getWordsByIds(wordIds);
      if (selected.length === 0) {
        res.status(400).json({ error: "None of the selected words were found." });
        return;
      }
    } else {
      selected = selectWordsForPassage(count, { dueOnly });
      if (selected.length === 0) {
        res.status(400).json({
          error: dueOnly ? "No words are due for review right now." : "Add some words first.",
        });
        return;
      }
    }

    const passage = await generatePassage(
      selected.map((w) => w.text),
      { count, difficulty, length, theme },
    );

    recordSeen(selected.map((w) => w.id));

    // Save to history and return the stored entry (with id + createdAt).
    const entry = addHistory({
      title: passage.title,
      passage: passage.passage,
      glossary: passage.glossary,
      words: selected, // includes ids so the client can render review buttons
    });
    res.json(entry);
  } catch (err) {
    console.error("Generation failed:", err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to generate a passage.",
    });
  }
});

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`🟢 Vocabulary Immersion API listening on http://localhost:${port}`);
});
