import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Database, GlossaryEntry, HistoryEntry, ReviewResult, Word } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Persist alongside the project root (server/.. -> repo root).
// Override with VIP_DATA_FILE to use a different file (e.g. for tests, so real
// data isn't touched).
const DB_PATH = process.env.VIP_DATA_FILE
  ? resolve(process.env.VIP_DATA_FILE)
  : resolve(__dirname, "../../data.json");

const MIN_BOX = 1;
const MAX_BOX = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 100;

// Leitner review schedule: how long a word "rests" in each box before it's
// due for review again. Lower boxes (less learned) come back sooner.
const REVIEW_INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };

let db: Database = load();

function load(): Database {
  const empty: Database = { words: [], history: [] };
  if (!existsSync(DB_PATH)) return empty;
  try {
    const parsed = JSON.parse(readFileSync(DB_PATH, "utf8")) as Partial<Database>;
    if (!parsed || !Array.isArray(parsed.words)) return empty;
    return {
      words: parsed.words,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return empty;
  }
}

function persist(): void {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

export function listWords(): Word[] {
  // Sorted by box (neediest first), then most recently added.
  return [...db.words].sort((a, b) => a.box - b.box || b.addedAt - a.addedAt);
}

/**
 * Add one or more words. Accepts a raw string that may contain multiple words
 * separated by commas or newlines. Duplicates (case-insensitive) are skipped.
 */
export function addWords(raw: string): Word[] {
  const incoming = raw
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const existing = new Set(db.words.map((w) => w.text.toLowerCase()));
  const added: Word[] = [];

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
    db.words.push(word);
    added.push(word);
  }

  if (added.length) persist();
  return added;
}

export function removeWord(id: string): boolean {
  const before = db.words.length;
  db.words = db.words.filter((w) => w.id !== id);
  const removed = db.words.length < before;
  if (removed) persist();
  return removed;
}

export function reviewWord(id: string, result: ReviewResult): Word | null {
  const word = db.words.find((w) => w.id === id);
  if (!word) return null;
  if (result === "got_it") {
    word.box = Math.min(MAX_BOX, word.box + 1);
  } else {
    word.box = MIN_BOX; // back to square one
  }
  persist();
  return word;
}

/** Mark words as having appeared in a freshly generated passage. */
export function recordSeen(ids: string[]): void {
  const now = Date.now();
  let changed = false;
  for (const id of ids) {
    const word = db.words.find((w) => w.id === id);
    if (!word) continue;
    word.timesSeen += 1;
    word.lastSeenAt = now;
    changed = true;
  }
  if (changed) persist();
}

/** Save a generated passage to history (newest first, capped). Returns the stored entry. */
export function addHistory(data: {
  title: string;
  passage: string;
  glossary: GlossaryEntry[];
  words: Word[];
}): HistoryEntry {
  const entry: HistoryEntry = {
    id: randomUUID(),
    title: data.title,
    passage: data.passage,
    glossary: data.glossary,
    words: data.words,
    createdAt: Date.now(),
  };
  db.history.unshift(entry);
  if (db.history.length > MAX_HISTORY) db.history.length = MAX_HISTORY;
  persist();
  return entry;
}

export function getHistory(): HistoryEntry[] {
  return db.history;
}

export function deleteHistory(id: string): boolean {
  const before = db.history.length;
  db.history = db.history.filter((h) => h.id !== id);
  const removed = db.history.length < before;
  if (removed) persist();
  return removed;
}

/** When a word next becomes due, based on its box and last-seen time. */
function dueAt(word: Word): number | null {
  if (word.lastSeenAt === null) return null; // never seen -> due immediately
  const days = REVIEW_INTERVAL_DAYS[word.box] ?? 1;
  return word.lastSeenAt + days * DAY_MS;
}

function isDue(word: Word, now: number): boolean {
  const due = dueAt(word);
  return due === null || now >= due;
}

/** Per-word review status, for the dashboard. */
export function wordStatus(word: Word, now = Date.now()): { isDue: boolean; dueAt: number | null } {
  return { isDue: isDue(word, now), dueAt: dueAt(word) };
}

export interface Stats {
  total: number;
  byBox: Record<number, number>;
  dueCount: number;
  due: Word[];
}

/** Aggregate progress: count per Leitner box and which words are due now. */
export function getStats(): Stats {
  const now = Date.now();
  const byBox: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const due: Word[] = [];
  for (const w of db.words) {
    byBox[w.box] = (byBox[w.box] ?? 0) + 1;
    if (isDue(w, now)) due.push(w);
  }
  // Neediest first: lowest box, then longest since last seen.
  due.sort((a, b) => a.box - b.box || (a.lastSeenAt ?? 0) - (b.lastSeenAt ?? 0));
  return { total: db.words.length, byBox, dueCount: due.length, due };
}

/**
 * Spaced-repetition weight for a word: lower Leitner boxes and words not seen
 * for a while score higher, so they resurface more often in new passages.
 */
function weight(word: Word, now: number): number {
  const boxWeight = (MAX_BOX - word.box + 1) * 2; // box 1 -> 10, box 5 -> 2
  let recency: number;
  if (word.lastSeenAt === null) {
    recency = 8; // never practiced -> high priority
  } else {
    const days = (now - word.lastSeenAt) / DAY_MS;
    recency = Math.min(days, 7); // caps the boost at a week
  }
  return boxWeight + recency + 1;
}

/**
 * Weighted random sample (without replacement) of up to `count` words, biased
 * toward the words that most need practice.
 */
export function selectWordsForPassage(
  count: number,
  opts: { dueOnly?: boolean } = {},
): Word[] {
  const now = Date.now();
  const candidates = opts.dueOnly ? db.words.filter((w) => isDue(w, now)) : db.words;
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
