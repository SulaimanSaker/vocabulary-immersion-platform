import { useState } from "react";
import type { Passage, ReviewResult } from "../types";
import { PassageView } from "./PassageView";
import { PassageAudio } from "./PassageAudio";

interface Props {
  passage: Passage;
  onReview: (id: string, result: ReviewResult) => void;
}

/** Renders a passage (live or from history) with audio, glossary, and review buttons. */
export function PassageCard({ passage, onReview }: Props) {
  const [reviewed, setReviewed] = useState<Record<string, ReviewResult>>({});

  function handle(id: string, result: ReviewResult) {
    setReviewed((prev) => ({ ...prev, [id]: result }));
    onReview(id, result);
  }

  return (
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
                    onClick={() => handle(w.id, "got_it")}
                  >
                    Got it
                  </button>
                  <button
                    className={`still ${mark === "still_learning" ? "active" : ""}`}
                    onClick={() => handle(w.id, "still_learning")}
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
  );
}
