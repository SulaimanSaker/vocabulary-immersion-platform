import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  Database,
  GlossaryEntry,
  HistoryEntry,
  ReviewResult,
  Stats,
  User,
  UserData,
  Word,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Override with VIP_DATA_FILE to use a different file (e.g. for tests).
const DB_PATH = process.env.VIP_DATA_FILE
  ? resolve(process.env.VIP_DATA_FILE)
  : resolve(__dirname, "../../data.json");

const MIN_BOX = 1;
const MAX_BOX = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 100;

// Leitner review schedule: days a word rests in each box before it's due again.
const REVIEW_INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };

let db: Database = load();

function load(): Database {
  const empty: Database = { users: [], data: {} };
  if (!existsSync(DB_PATH)) return empty;
  try {
    const parsed = JSON.parse(readFileSync(DB_PATH, "utf8")) as Partial<Database>;
    if (!parsed || !Array.isArray(parsed.users) || typeof parsed.data !== "object" || !parsed.data) {
      return empty;
    }
    return { users: parsed.users, data: parsed.data as Record<string, UserData> };
  } catch {
    return empty;
  }
}

function persist(): void {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

/** Get (creating if needed) the per-user data bucket. */
function bucket(userId: string): UserData {
  let data = db.data[userId];
  if (!data) {
    data = { words: [], history: [] };
    db.data[userId] = data;
  }
  return data;
}

// ---- Users ----

export function createUser(email: string, passwordHash: string): User {
  const user: User = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    passwordHash,
    createdAt: Date.now(),
  };
  db.users.push(user);
  db.data[user.id] = { words: [], history: [] };
  persist();
  return user;
}

export function getUserByEmail(email: string): User | undefined {
  const key = email.trim().toLowerCase();
  return db.users.find((u) => u.email === key);
}

export function getUserById(id: string): User | undefined {
  return db.users.find((u) => u.id === id);
}

// ---- Words ----

export function listWords(userId: string): Word[] {
  return [...bucket(userId).words].sort((a, b) => a.box - b.box || b.addedAt - a.addedAt);
}

export function addWords(userId: string, raw: string): Word[] {
  const words = bucket(userId).words;
  const incoming = raw
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const existing = new Set(words.map((w) => w.text.toLowerCase()));
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
    words.push(word);
    added.push(word);
  }

  if (added.length) persist();
  return added;
}

export function removeWord(userId: string, id: string): boolean {
  const data = bucket(userId);
  const before = data.words.length;
  data.words = data.words.filter((w) => w.id !== id);
  const removed = data.words.length < before;
  if (removed) persist();
  return removed;
}

/** Resolve word ids to Word objects for this user, preserving order, skipping unknown/dupes. */
export function getWordsByIds(userId: string, ids: string[]): Word[] {
  const byId = new Map(bucket(userId).words.map((w) => [w.id, w]));
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

export function reviewWord(userId: string, id: string, result: ReviewResult): Word | null {
  const word = bucket(userId).words.find((w) => w.id === id);
  if (!word) return null;
  word.box = result === "got_it" ? Math.min(MAX_BOX, word.box + 1) : MIN_BOX;
  persist();
  return word;
}

export function recordSeen(userId: string, ids: string[]): void {
  const words = bucket(userId).words;
  const now = Date.now();
  let changed = false;
  for (const id of ids) {
    const word = words.find((w) => w.id === id);
    if (!word) continue;
    word.timesSeen += 1;
    word.lastSeenAt = now;
    changed = true;
  }
  if (changed) persist();
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

export function getStats(userId: string): Stats {
  const now = Date.now();
  const words = bucket(userId).words;
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
  let recency: number;
  if (word.lastSeenAt === null) {
    recency = 8;
  } else {
    recency = Math.min((now - word.lastSeenAt) / DAY_MS, 7);
  }
  return boxWeight + recency + 1;
}

export function selectWordsForPassage(
  userId: string,
  count: number,
  opts: { dueOnly?: boolean } = {},
): Word[] {
  const now = Date.now();
  const all = bucket(userId).words;
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

export function addHistory(
  userId: string,
  data: { title: string; passage: string; glossary: GlossaryEntry[]; words: Word[] },
): HistoryEntry {
  const entry: HistoryEntry = {
    id: randomUUID(),
    title: data.title,
    passage: data.passage,
    glossary: data.glossary,
    words: data.words,
    createdAt: Date.now(),
  };
  const history = bucket(userId).history;
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  persist();
  return entry;
}

export function getHistory(userId: string): HistoryEntry[] {
  return bucket(userId).history;
}

export function deleteHistory(userId: string, id: string): boolean {
  const data = bucket(userId);
  const before = data.history.length;
  data.history = data.history.filter((h) => h.id !== id);
  const removed = data.history.length < before;
  if (removed) persist();
  return removed;
}
