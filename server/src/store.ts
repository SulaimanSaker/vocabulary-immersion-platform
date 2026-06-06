import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client, type Row } from "@libsql/client";
import type { GlossaryEntry, HistoryEntry, ReviewResult, Stats, User, Word } from "./types.js";

const MIN_BOX = 1;
const MAX_BOX = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 100;

// Leitner review schedule: days a word rests in each box before it's due again.
const REVIEW_INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  box INTEGER NOT NULL,
  times_seen INTEGER NOT NULL,
  last_seen_at INTEGER,
  added_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_words_user ON words(user_id);
CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  passage TEXT NOT NULL,
  glossary TEXT NOT NULL,
  words TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
`;

// Lazy, read after dotenv has loaded. Local default is a relative file (avoids
// Windows absolute-path file-URL quirks); on Azure set VIP_DB_FILE=/home/data/data.db.
function dbUrl(): string {
  const f = process.env.VIP_DB_FILE?.trim();
  if (f) return f.startsWith("file:") ? f : `file:${f}`;
  return "file:./data.db";
}

// Make sure the parent directory of an explicit DB path exists (e.g. Azure's /home/data).
function ensureDir(): void {
  const f = process.env.VIP_DB_FILE?.trim();
  if (!f) return;
  const path = f.startsWith("file:") ? f.slice("file:".length) : f;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    /* ignore — createClient will surface a clear error if it truly can't open */
  }
}

let ready: Promise<Client> | null = null;
function getDb(): Promise<Client> {
  if (!ready) {
    ready = (async () => {
      ensureDir();
      const client = createClient({ url: dbUrl() });
      await client.executeMultiple(SCHEMA);
      return client;
    })();
  }
  return ready;
}

// ---- Row mappers ----

function toWord(r: Row): Word {
  return {
    id: String(r.id),
    text: String(r.text),
    box: Number(r.box),
    timesSeen: Number(r.times_seen),
    lastSeenAt: r.last_seen_at === null ? null : Number(r.last_seen_at),
    addedAt: Number(r.added_at),
  };
}

function toHistory(r: Row): HistoryEntry {
  return {
    id: String(r.id),
    title: String(r.title),
    passage: String(r.passage),
    glossary: JSON.parse(String(r.glossary)) as GlossaryEntry[],
    words: JSON.parse(String(r.words)) as Word[],
    createdAt: Number(r.created_at),
  };
}

function toUser(r: Row): User {
  return {
    id: String(r.id),
    email: String(r.email),
    passwordHash: String(r.password_hash),
    createdAt: Number(r.created_at),
  };
}

// ---- Users ----

export async function createUser(email: string, passwordHash: string): Promise<User> {
  const db = await getDb();
  const user: User = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    passwordHash,
    createdAt: Date.now(),
  };
  await db.execute({
    sql: "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    args: [user.id, user.email, user.passwordHash, user.createdAt],
  });
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email.trim().toLowerCase()],
  });
  return rs.rows[0] ? toUser(rs.rows[0]) : undefined;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const db = await getDb();
  const rs = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  return rs.rows[0] ? toUser(rs.rows[0]) : undefined;
}

// ---- Words ----

export async function listWords(userId: string): Promise<Word[]> {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM words WHERE user_id = ? ORDER BY box ASC, added_at DESC",
    args: [userId],
  });
  return rs.rows.map(toWord);
}

export async function addWords(userId: string, raw: string): Promise<Word[]> {
  const db = await getDb();
  const incoming = raw
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (incoming.length === 0) return [];

  const existingRs = await db.execute({
    sql: "SELECT lower(text) AS t FROM words WHERE user_id = ?",
    args: [userId],
  });
  const existing = new Set(existingRs.rows.map((r) => String(r.t)));

  const added: Word[] = [];
  const stmts = [];
  for (const text of incoming) {
    const key = text.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    const word: Word = {
      id: randomUUID(),
      text,
      box: MIN_BOX,
      timesSeen: 0,
      lastSeenAt: null,
      addedAt: Date.now(),
    };
    added.push(word);
    stmts.push({
      sql: "INSERT INTO words (id, user_id, text, box, times_seen, last_seen_at, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [word.id, userId, word.text, word.box, word.timesSeen, word.lastSeenAt, word.addedAt],
    });
  }
  if (stmts.length) await db.batch(stmts, "write");
  return added;
}

export async function removeWord(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const rs = await db.execute({
    sql: "DELETE FROM words WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return rs.rowsAffected > 0;
}

export async function getWordsByIds(userId: string, ids: string[]): Promise<Word[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(", ");
  const rs = await db.execute({
    sql: `SELECT * FROM words WHERE user_id = ? AND id IN (${placeholders})`,
    args: [userId, ...ids],
  });
  const byId = new Map(rs.rows.map((r) => [String(r.id), toWord(r)]));
  const seen = new Set<string>();
  const result: Word[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const word = byId.get(id);
    if (word) {
      result.push(word);
      seen.add(id);
    }
  }
  return result;
}

export async function reviewWord(
  userId: string,
  id: string,
  result: ReviewResult,
): Promise<Word | null> {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM words WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  if (!rs.rows[0]) return null;
  const word = toWord(rs.rows[0]);
  word.box = result === "got_it" ? Math.min(MAX_BOX, word.box + 1) : MIN_BOX;
  await db.execute({
    sql: "UPDATE words SET box = ? WHERE id = ? AND user_id = ?",
    args: [word.box, id, userId],
  });
  return word;
}

export async function recordSeen(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const now = Date.now();
  await db.batch(
    ids.map((id) => ({
      sql: "UPDATE words SET times_seen = times_seen + 1, last_seen_at = ? WHERE id = ? AND user_id = ?",
      args: [now, id, userId],
    })),
    "write",
  );
}

// ---- Spaced repetition ----

function dueAt(word: Word): number | null {
  if (word.lastSeenAt === null) return null;
  const days = REVIEW_INTERVAL_DAYS[word.box] ?? 1;
  return word.lastSeenAt + days * DAY_MS;
}

function isDue(word: Word, now: number): boolean {
  const due = dueAt(word);
  return due === null || now >= due;
}

export function wordStatus(word: Word, now = Date.now()): { isDue: boolean; dueAt: number | null } {
  return { isDue: isDue(word, now), dueAt: dueAt(word) };
}

export async function getStats(userId: string): Promise<Stats> {
  const now = Date.now();
  const words = await listWords(userId);
  const byBox: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const due: Word[] = [];
  for (const w of words) {
    byBox[w.box] = (byBox[w.box] ?? 0) + 1;
    if (isDue(w, now)) due.push(w);
  }
  due.sort((a, b) => a.box - b.box || (a.lastSeenAt ?? 0) - (b.lastSeenAt ?? 0));
  return { total: words.length, byBox, dueCount: due.length, due };
}

function weight(word: Word, now: number): number {
  const boxWeight = (MAX_BOX - word.box + 1) * 2;
  const recency = word.lastSeenAt === null ? 8 : Math.min((now - word.lastSeenAt) / DAY_MS, 7);
  return boxWeight + recency + 1;
}

export async function selectWordsForPassage(
  userId: string,
  count: number,
  opts: { dueOnly?: boolean } = {},
): Promise<Word[]> {
  const now = Date.now();
  const all = await listWords(userId);
  const candidates = opts.dueOnly ? all.filter((w) => isDue(w, now)) : all;
  const pool = candidates.map((w) => ({ word: w, weight: weight(w, now) }));
  const picked: Word[] = [];

  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j].weight;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    picked.push(pool[idx].word);
    pool.splice(idx, 1);
  }
  return picked;
}

// ---- History ----

export async function addHistory(
  userId: string,
  data: { title: string; passage: string; glossary: GlossaryEntry[]; words: Word[] },
): Promise<HistoryEntry> {
  const db = await getDb();
  const entry: HistoryEntry = {
    id: randomUUID(),
    title: data.title,
    passage: data.passage,
    glossary: data.glossary,
    words: data.words,
    createdAt: Date.now(),
  };
  await db.execute({
    sql: "INSERT INTO history (id, user_id, title, passage, glossary, words, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [
      entry.id,
      userId,
      entry.title,
      entry.passage,
      JSON.stringify(entry.glossary),
      JSON.stringify(entry.words),
      entry.createdAt,
    ],
  });
  // Keep only the most recent MAX_HISTORY entries for this user.
  await db.execute({
    sql: `DELETE FROM history WHERE user_id = ? AND id NOT IN (
            SELECT id FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
          )`,
    args: [userId, userId, MAX_HISTORY],
  });
  return entry;
}

export async function getHistory(userId: string): Promise<HistoryEntry[]> {
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC",
    args: [userId],
  });
  return rs.rows.map(toHistory);
}

export async function deleteHistory(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const rs = await db.execute({
    sql: "DELETE FROM history WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return rs.rowsAffected > 0;
}
