import { useEffect, useState } from "react";
import * as api from "./api";
import type { GenerateOptions, Passage, ReviewResult, Stats, Word } from "./types";
import { WordList } from "./components/WordList";
import { Controls } from "./components/Controls";
import { PassageView } from "./components/PassageView";
import { PassageAudio } from "./components/PassageAudio";
import { Dashboard } from "./components/Dashboard";

const DEFAULT_OPTS: GenerateOptions = {
  count: 5,
  theme: "",
  difficulty: "medium",
  length: "medium",
};

export default function App() {
  const [words, setWords] = useState<Word[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [opts, setOpts] = useState<GenerateOptions>(DEFAULT_OPTS);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Record<string, ReviewResult>>({});

  async function refresh() {
    const [w, s] = await Promise.all([api.getWords(), api.getStats()]);
    setWords(w.words);
    setStats(s);
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
    setReviewed({});
    try {
      const result = await api.generatePassage(opts, dueOnly);
      setPassage(result);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(id: string, result: ReviewResult) {
    setReviewed((prev) => ({ ...prev, [id]: result }));
    await api.reviewWord(id, result);
    await refresh();
  }

  const dueIds = new Set((stats?.due ?? []).map((w) => w.id));

  return (
    <div className="app">
      <header className="topbar">
        <h1>📖 Vocabulary Immersion</h1>
        <p>Add words you want to remember. The app keeps writing fresh passages that use them.</p>
      </header>

      <div className="layout">
        <WordList words={words} dueIds={dueIds} onAdd={handleAdd} onDelete={handleDelete} />

        <main className="reader">
          {stats && (
            <Dashboard stats={stats} onStudyDue={() => runGenerate(true)} loading={loading} />
          )}

          <Controls
            opts={opts}
            onChange={setOpts}
            onGenerate={() => runGenerate(false)}
            loading={loading}
            disabled={words.length === 0}
          />

          {error && <div className="error">{error}</div>}

          {!passage && !loading && (
            <div className="placeholder">
              {words.length === 0
                ? "Add a few words on the left, then generate your first passage."
                : "Hit “Generate passage” to get reading."}
            </div>
          )}

          {passage && (
            <article className="passage">
              <div className="passage-header">
                <h2>{passage.title}</h2>
                <PassageAudio text={passage.passage} />
              </div>
              <PassageView text={passage.passage} />

              <section className="glossary">
                <h3>Glossary &amp; review</h3>
                <ul>
                  {passage.words.map((w) => {
                    const entry = passage.glossary.find(
                      (g) => g.word.toLowerCase() === w.text.toLowerCase(),
                    );
                    const mark = reviewed[w.id];
                    return (
                      <li key={w.id}>
                        <div className="gloss-text">
                          <strong>{w.text}</strong>
                          {entry && <span> — {entry.definition}</span>}
                        </div>
                        <div className="review-buttons">
                          <button
                            className={`got ${mark === "got_it" ? "active" : ""}`}
                            onClick={() => handleReview(w.id, "got_it")}
                          >
                            Got it
                          </button>
                          <button
                            className={`still ${mark === "still_learning" ? "active" : ""}`}
                            onClick={() => handleReview(w.id, "still_learning")}
                          >
                            Still learning
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
