import type { Passage } from "../types";

interface Props {
  history: Passage[];
  onOpen: (entry: Passage) => void;
  onDelete: (id: string) => void;
}

export function History({ history, onOpen, onDelete }: Props) {
  if (history.length === 0) {
    return (
      <div className="placeholder">
        No saved passages yet. Generate one and it’ll appear here to re-read.
      </div>
    );
  }

  return (
    <ul className="history-list">
      {history.map((h) => (
        <li key={h.id} className="history-item">
          <button className="history-open" onClick={() => onOpen(h)}>
            <span className="history-title">{h.title}</span>
            <span className="history-meta">
              {new Date(h.createdAt).toLocaleString()} · {h.words.map((w) => w.text).join(", ")}
            </span>
          </button>
          <button
            className="history-delete"
            onClick={() => onDelete(h.id)}
            title="Delete"
            aria-label={`Delete ${h.title}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
