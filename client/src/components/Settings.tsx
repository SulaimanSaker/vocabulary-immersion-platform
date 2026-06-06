import { useState } from "react";

interface Props {
  apiKey: string;
  onSave: (key: string) => void;
  onClose: () => void;
}

export function Settings({ apiKey, onSave, onClose }: Props) {
  const [value, setValue] = useState(apiKey);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label className="settings-field">
          Your Gemini API key
          <input
            type="password"
            value={value}
            placeholder="AIza… or your key"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>

        <p className="settings-note">
          Your key is stored only in this browser and sent with your requests — it never leaves
          your device except to call Gemini. Get a free key at{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>
          .
        </p>

        <div className="modal-actions">
          {value && (
            <button className="ghost" onClick={() => setValue("")}>
              Clear
            </button>
          )}
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => {
              onSave(value.trim());
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
