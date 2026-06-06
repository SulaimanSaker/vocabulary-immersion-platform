export interface Word {
  id: string;
  text: string;
  box: number;
  timesSeen: number;
  lastSeenAt: number | null;
  addedAt: number;
}

export type ReviewResult = "got_it" | "still_learning";

export interface GlossaryEntry {
  word: string;
  definition: string;
}

export interface Passage {
  id: string;
  title: string;
  passage: string;
  glossary: GlossaryEntry[];
  words: Word[];
  createdAt: number;
}

export type Difficulty = "easy" | "medium" | "hard";
export type Length = "short" | "medium" | "long";

export interface GenerateOptions {
  count: number;
  theme: string;
  difficulty: Difficulty;
  length: Length;
}

export interface Stats {
  total: number;
  byBox: Record<number, number>;
  dueCount: number;
  due: Word[];
}
