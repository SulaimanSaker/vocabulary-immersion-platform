export interface Word {
  id: string;
  text: string;
  /** Leitner box, 1 (needs the most practice) .. 5 (well learned). */
  box: number;
  /** How many generated passages this word has appeared in. */
  timesSeen: number;
  /** Epoch ms of the last passage it appeared in, or null if never. */
  lastSeenAt: number | null;
  addedAt: number;
}

export interface Database {
  words: Word[];
}

export type ReviewResult = "got_it" | "still_learning";

export interface GlossaryEntry {
  word: string;
  definition: string;
}

export interface GeneratedPassage {
  title: string;
  /** Passage text; each target-word usage is wrapped in [[double brackets]]. */
  passage: string;
  glossary: GlossaryEntry[];
}

export type Difficulty = "easy" | "medium" | "hard";
export type Length = "short" | "medium" | "long";

export interface GenerateOptions {
  count: number;
  theme?: string;
  difficulty: Difficulty;
  length: Length;
}
