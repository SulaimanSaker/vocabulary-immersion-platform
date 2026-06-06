import { useEffect, useState } from "react";
import * as api from "./api";
import type { GenerateOptions, Passage, ReviewResult, Stats, Word } from "./types";
import { WordList } from "./components/WordList";
import { Controls } from "./components/Controls";
import { Dashboard } from "./components/Dashboard";
import { PassageCard } from "./components/PassageCard";
import { History } from "./components/History";

const DEFAULT_OPTS: GenerateOptions = {
  count: 5,
  theme: "",
  difficulty: "medium",
  length: "medium",
};

type View = "read" | "history";

export default function App() {
  const [words, setWords] = useState<Word[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<Passage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opts, setOpts] = useState<GenerateOptions>(DEFAULT_OPTS);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [view, setView] = useState<View>("read");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [w, s, h] = await Promise.all([api.getWords(), api.getStats(), api.getHistory()]);
    setWords(w.words);
    setStats(s);
    setHistory(h.history);
    // Drop any selected ids that no longer exist.
    const ids = new Set(w.words.map((x) => x.id));
    setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
  }

  function toggleWord(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(words.map((w) => w.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  async function handleAdd(text: string) {
    await api.addWords(text);
    await refresh();
  }

  async function handleDelete(id: string) {
    await api.deleteWord(id);
    await refresh();
  }

  async function runGenerate(dueOnly: boolean) {
    setLoading(true);
    setError(null);
    try {
      // Study-due ignores manual selection; normal generate uses it (if any).
      const wordIds = dueOnly ? [] : Array.from(selected);
      const result = await api.generatePassage(opts, dueOnly, wordIds);
      setPassage(result);
      setView("read");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
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

  const dueIds = new Set((stats?.due ?? []).map((w) => w.id));

  return (
    <div className="app">
      <header className="topbar">
        <h1>📖 Vocabulary Immersion</h1>
        <p>Add words you want to remember. The app keeps writing fresh passages that use them.</p>
      </header>

      <div className="layout">
        <WordList
          words={words}
          dueIds={dueIds}
          selected={selected}
          onToggle={toggleWord}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onAdd={handleAdd}
          onDelete={handleDelete}
        />

        <main className="reader">
          <nav className="tabs">
            <button
              className={view === "read" ? "tab active" : "tab"}
              onClick={() => setView("read")}
            >
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
    </div>
  );
}
