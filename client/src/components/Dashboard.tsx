import type { Stats } from "../types";

interface Props {
  stats: Stats;
  onStudyDue: () => void;
  loading: boolean;
}

const BOXES = [
  { box: 1, label: "new" },
  { box: 2, label: "learning" },
  { box: 3, label: "familiar" },
  { box: 4, label: "strong" },
  { box: 5, label: "mastered" },
];

export function Dashboard({ stats, onStudyDue, loading }: Props) {
  if (stats.total === 0) return null;

  return (
    <section className="dashboard">
      <div className="dash-progress" aria-hidden>
        {BOXES.map(({ box }) => {
          const n = stats.byBox[box] ?? 0;
          if (n === 0) return null;
          return (
            <span
              key={box}
              className={`bar box-${box}`}
              style={{ flexGrow: n }}
              title={`${n} in box ${box}`}
            />
          );
        })}
      </div>

      <div className="dash-legend">
        {BOXES.map(({ box, label }) => (
          <span key={box} className="legend-item">
            <span className={`dot box-${box}`} />
            {label} <strong>{stats.byBox[box] ?? 0}</strong>
          </span>
        ))}
      </div>

      <div className="dash-due">
        <span className="due-count">
          {stats.dueCount > 0
            ? `🔁 ${stats.dueCount} word${stats.dueCount === 1 ? "" : "s"} due for review`
            : "✅ Nothing due right now — you're caught up"}
        </span>
        <button
          className="study-due"
          onClick={onStudyDue}
          disabled={loading || stats.dueCount === 0}
        >
          {loading ? "Writing…" : "Study due words"}
        </button>
      </div>
    </section>
  );
}
