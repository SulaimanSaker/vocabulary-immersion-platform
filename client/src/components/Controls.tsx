import type { Difficulty, GenerateOptions, Length } from "../types";

interface Props {
  opts: GenerateOptions;
  onChange: (opts: GenerateOptions) => void;
  onGenerate: () => void;
  loading: boolean;
  disabled: boolean;
  selectedCount: number;
}

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const LENGTHS: Length[] = ["short", "medium", "long"];

export function Controls({
  opts,
  onChange,
  onGenerate,
  loading,
  disabled,
  selectedCount,
}: Props) {
  const usingSelection = selectedCount > 0;
  return (
    <div className="controls">
      <div className="controls-row">
        <label>
          Words / passage
          <input
            type="number"
            min={1}
            max={15}
            value={opts.count}
            disabled={usingSelection}
            title={usingSelection ? "Ignored while you have words selected" : undefined}
            onChange={(e) => onChange({ ...opts, count: Number(e.target.value) })}
          />
        </label>

        <label>
          Difficulty
          <select
            value={opts.difficulty}
            onChange={(e) => onChange({ ...opts, difficulty: e.target.value as Difficulty })}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label>
          Length
          <select
            value={opts.length}
            onChange={(e) => onChange({ ...opts, length: e.target.value as Length })}
          >
            {LENGTHS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="theme">
        Theme (optional)
        <input
          type="text"
          value={opts.theme}
          placeholder="e.g. a detective story, space travel, a cooking show…"
          onChange={(e) => onChange({ ...opts, theme: e.target.value })}
        />
      </label>

      <button className="generate" onClick={onGenerate} disabled={loading || disabled}>
        {loading
          ? "Writing…"
          : usingSelection
            ? `Generate with ${selectedCount} selected word${selectedCount === 1 ? "" : "s"}`
            : "Generate passage"}
      </button>
    </div>
  );
}
