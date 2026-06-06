import type { Difficulty, GenerateOptions, Length, TextFormat } from "../types";

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

const FORMATS: { value: TextFormat; label: string }[] = [
  { value: "sentences", label: "Sentences" },
  { value: "paragraphs", label: "Paragraphs" },
  { value: "story", label: "Story" },
  { value: "conversation", label: "Conversation" },
  { value: "custom", label: "Personalized" },
];

const PERSONALIZED_PRESETS = [
  "Programming article",
  "Business story",
  "Science explanation",
  "Historical event",
];

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
          Format
          <select
            value={opts.format}
            onChange={(e) => onChange({ ...opts, format: e.target.value as TextFormat })}
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
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

      {opts.format === "custom" && (
        <div className="personalized">
          <label>
            What kind of content?
            <input
              type="text"
              value={opts.customType}
              placeholder="e.g. a programming article, a business story, a science explanation…"
              onChange={(e) => onChange({ ...opts, customType: e.target.value })}
            />
          </label>
          <div className="preset-chips">
            {PERSONALIZED_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={opts.customType === preset ? "chip active" : "chip"}
                onClick={() => onChange({ ...opts, customType: preset })}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      )}

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
