import type { GenerateOptions, Passage, ReviewResult, Stats, Word } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export function getWords() {
  return request<{ words: Word[] }>("/api/words");
}

export function getStats() {
  return request<Stats>("/api/stats");
}

export function addWords(text: string) {
  return request<{ added: Word[]; words: Word[] }>("/api/words", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function deleteWord(id: string) {
  return request<{ words: Word[] }>(`/api/words/${id}`, { method: "DELETE" });
}

export function reviewWord(id: string, result: ReviewResult) {
  return request<{ word: Word; words: Word[] }>(`/api/words/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ result }),
  });
}

export function generatePassage(opts: GenerateOptions, dueOnly = false) {
  return request<Passage>("/api/generate", {
    method: "POST",
    body: JSON.stringify({ ...opts, dueOnly }),
  });
}
