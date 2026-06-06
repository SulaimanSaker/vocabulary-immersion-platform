import { useState } from "react";
import type { Word } from "../types";

interface Props {
  words: Word[];
  dueIds: Set<string>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onAdd: (text: string) => Promise<void>;
  onDelete: (id: string) => void;
}

const BOX_LABELS = ["", "new", "learning", "familiar", "strong", "mastered"];

export function WordList({
  words,
  dueIds,
  selected,
  onToggle,
  onSelectAll,
  onClearSelection,
  onAdd,
  onDelete,
}: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    try {
      await onAdd(input);
      setInput("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="word-panel">
      <h2>Your words <span className="count">{words.length}</span></h2>

      <form onSubmit={handleAdd} className="add-form">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add words — one per line, or comma-separated"
          rows={3}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "Adding…" : "Add words"}
        </button>
      </form>

      {words.length === 0 ? (
        <p className="empty">No words yet. Add a few to get started.</p>
      ) : (
        <>
          <div className="select-bar">
            <span>
              {selected.size > 0 ? `${selected.size} selected for next passage` : "Pick words, or let it choose"}
            </span>
            <span className="select-actions">
              <button onClick={onSelectAll}>All</button>
              <button onClick={onClearSelection} disabled={selected.size === 0}>
                None
              </button>
            </span>
          </div>
          <ul className="words">
            {words.map((w) => (
              <li key={w.id} className={dueIds.has(w.id) ? "due" : ""}>
                <input
                  type="checkbox"
                  className="word-check"
                  checked={selected.has(w.id)}
                  onChange={() => onToggle(w.id)}
                  aria-label={`Include ${w.text} in the next passage`}
                />
                {dueIds.has(w.id) && <span className="due-dot" title="Due for review" />}
                <span className="word-text">{w.text}</span>
              <span className={`box box-${w.box}`} title={`Seen ${w.timesSeen}×`}>
                {BOX_LABELS[w.box]}
              </span>
              <button
                className="remove"
                onClick={() => onDelete(w.id)}
                title="Remove word"
                aria-label={`Remove ${w.text}`}
              >
                ×
              </button>
            </li>
          ))}
          </ul>
        </>
      )}
    </aside>
  );
}
