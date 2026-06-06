import type { GenerateOptions, Passage, ReviewResult, Stats, User, Word } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

// ---- Auth ----

export function register(email: string, password: string) {
  return request<{ user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string) {
  return request<{ user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

/** Returns the current user, or null if not signed in. */
export async function getMe(): Promise<User | null> {
  try {
    const r = await request<{ user: User }>("/api/auth/me");
    return r.user;
  } catch {
    return null;
  }
}

// ---- Words ----

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

// ---- History ----

export function getHistory() {
  return request<{ history: Passage[] }>("/api/history");
}

export function deleteHistory(id: string) {
  return request<{ history: Passage[] }>(`/api/history/${id}`, { method: "DELETE" });
}

// ---- Generate ----

export function generatePassage(
  opts: GenerateOptions,
  dueOnly = false,
  wordIds: string[] = [],
  apiKey = "",
) {
  return request<Passage>("/api/generate", {
    method: "POST",
    headers: apiKey ? { "x-gemini-key": apiKey } : {},
    body: JSON.stringify({ ...opts, dueOnly, wordIds }),
  });
}
