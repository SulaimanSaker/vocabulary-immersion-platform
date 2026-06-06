import { useEffect, useState } from "react";
import * as api from "./api";
import type { GenerateOptions, Passage, ReviewResult, Stats, User, Word } from "./types";
import { WordList } from "./components/WordList";
import { Controls } from "./components/Controls";
import { Dashboard } from "./components/Dashboard";
import { PassageCard } from "./components/PassageCard";
import { History } from "./components/History";
import { AuthScreen } from "./components/AuthScreen";
import { Settings } from "./components/Settings";

const DEFAULT_OPTS: GenerateOptions = {
  theme: "",
  difficulty: "medium",
  length: "medium",
  format: "paragraphs",
  customType: "",
};

const KEY_STORAGE = "vip_gemini_key";
type View = "read" | "history";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [words, setWords] = useState<Word[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<Passage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opts, setOpts] = useState<GenerateOptions>(DEFAULT_OPTS);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [view, setView] = useState<View>("read");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) ?? "");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    api.getMe().then((u) => {
      setUser(u);
      setAuthChecked(true);
      if (u) refresh().catch((e) => setError(e.message));
    });
  }, []);

  async function refresh() {
    const [w, s, h] = await Promise.all([api.getWords(), api.getStats(), api.getHistory()]);
    setWords(w.words);
    setStats(s);
    setHistory(h.history);
    const ids = new Set(w.words.map((x) => x.id));
    setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
  }

  function onAuthed(u: User) {
    setUser(u);
    refresh().catch((e) => setError(e.message));
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    setUser(null);
    setWords([]);
    setStats(null);
    setHistory([]);
    setPassage(null);
    setSelected(new Set());
    setView("read");
  }

  function saveKey(key: string) {
    setApiKey(key);
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  }

  function handleAuthError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : "";
    if (/signed in|session expired/i.test(msg)) {
      setUser(null);
      return true;
    }
    return false;
  }

  async function handleAdd(text: string) {
    await api.addWords(text);
    await refresh();
  }

  async function handleDelete(id: string) {
    await api.deleteWord(id);
    await refresh();
  }

  async function runGenerate(dueOnly: boolean) {
    if (!apiKey) {
      setError("Add your Gemini API key in Settings first.");
      setShowSettings(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const wordIds = dueOnly ? [] : Array.from(selected);
      const result = await api.generatePassage(opts, dueOnly, wordIds, apiKey);
      setPassage(result);
      setView("read");
      await refresh();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(id: string, result: ReviewResult) {
    await api.reviewWord(id, result);
    await refresh();
  }

  function openFromHistory(entry: Passage) {
    setPassage(entry);
    setView("read");
  }

  async function deleteFromHistory(id: string) {
    const r = await api.deleteHistory(id);
    setHistory(r.history);
  }

  function toggleWord(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!authChecked) {
    return <div className="splash">Loading…</div>;
  }

  if (!user) {
    return <AuthScreen onAuthed={onAuthed} />;
  }

  const dueIds = new Set((stats?.due ?? []).map((w) => w.id));

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>📖 Vocabulary Immersion</h1>
          <p>Add words you want to remember. The app keeps writing fresh passages that use them.</p>
        </div>
        <div className="topbar-actions">
          <span className="who" title={user.email}>
            {user.email}
          </span>
          <button className="ghost" onClick={() => setShowSettings(true)}>
            ⚙ Settings{!apiKey && <span className="needs-key" title="No API key set"> ●</span>}
          </button>
          <button className="ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {!apiKey && (
        <div className="key-banner">
          Add your free Gemini API key in <strong>⚙ Settings</strong> to start generating passages.
        </div>
      )}

      <div className="layout">
        <WordList
          words={words}
          dueIds={dueIds}
          selected={selected}
          onToggle={toggleWord}
          onSelectAll={() => setSelected(new Set(words.map((w) => w.id)))}
          onClearSelection={() => setSelected(new Set())}
          onAdd={handleAdd}
          onDelete={handleDelete}
        />

        <main className="reader">
          <nav className="tabs">
            <button className={view === "read" ? "tab active" : "tab"} onClick={() => setView("read")}>
              Read
            </button>
            <button
              className={view === "history" ? "tab active" : "tab"}
              onClick={() => setView("history")}
            >
              History <span className="tab-count">{history.length}</span>
            </button>
          </nav>

          {view === "read" && (
            <>
              {stats && (
                <Dashboard stats={stats} onStudyDue={() => runGenerate(true)} loading={loading} />
              )}

              <Controls
                opts={opts}
                onChange={setOpts}
                onGenerate={() => runGenerate(false)}
                loading={loading}
                disabled={words.length === 0}
                selectedCount={selected.size}
              />

              {error && <div className="error">{error}</div>}

              {!passage && !loading && (
                <div className="placeholder">
                  {words.length === 0
                    ? "Add a few words on the left, then generate your first passage."
                    : "Hit “Generate passage” to get reading."}
                </div>
              )}

              {passage && <PassageCard key={passage.id} passage={passage} onReview={handleReview} />}
            </>
          )}

          {view === "history" && (
            <History history={history} onOpen={openFromHistory} onDelete={deleteFromHistory} />
          )}
        </main>
      </div>

      {showSettings && (
        <Settings apiKey={apiKey} onSave={saveKey} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
