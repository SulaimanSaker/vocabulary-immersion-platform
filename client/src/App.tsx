import { useEffect, useState } from "react";
import * as api from "./api";
import type { GenerateOptions, Passage, ReviewResult, Word } from "./types";
import { WordList } from "./components/WordList";
import { Controls } from "./components/Controls";
import { PassageView } from "./components/PassageView";

const DEFAULT_OPTS: GenerateOptions = {
  count: 5,
  theme: "",
  difficulty: "medium",
  length: "medium",
};

export default function App() {
  const [words, setWords] = useState<Word[]>([]);
  const [opts, setOpts] = useState<GenerateOptions>(DEFAULT_OPTS);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Record<string, ReviewResult>>({});

  useEffect(() => {
    api.getWords().then((r) => setWords(r.words)).catch((e) => setError(e.message));
  }, []);

  async function handleAdd(text: string) {
    const r = await api.addWords(text);
    setWords(r.words);
  }

  async function handleDelete(id: string) {
    const r = await api.deleteWord(id);
    setWords(r.words);
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setReviewed({});
    try {
      const result = await api.generatePassage(opts);
      setPassage(result);
      setWords((prev) => mergeSeen(prev, result.words));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(id: string, result: ReviewResult) {
    setReviewed((prev) => ({ ...prev, [id]: result }));
    const r = await api.reviewWord(id, result);
    setWords(r.words);
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>📖 Vocabulary Immersion</h1>
        <p>Add words you want to remember. Claude keeps writing fresh passages that use them.</p>
      </header>

      <div className="layout">
        <WordList words={words} onAdd={handleAdd} onDelete={handleDelete} />

        <main className="reader">
          <Controls
            opts={opts}
            onChange={setOpts}
            onGenerate={handleGenerate}
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
              <h2>{passage.title}</h2>
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

/** Reflect the updated seen-counts returned with a freshly generated passage. */
function mergeSeen(prev: Word[], used: Word[]): Word[] {
  const byId = new Map(used.map((w) => [w.id, w]));
  return prev.map((w) => byId.get(w.id) ?? w);
}
