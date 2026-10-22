import { useState } from "react";
import { MAX_CHAT_LENGTH } from "@mush2/shared";

/** The feature's tracker: a list of lines the player types in themselves. */
export function Tracker({ notes, onChange }: { notes: string[]; onChange: (notes: string[]) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="tracker">
      <ul className="tracker-list">
        {notes.length === 0 && <li className="sub">Nothing tracked yet.</li>}
        {notes.map((note, i) => (
          <li key={i}>
            <span>{note}</span>
            <button
              className="tracker-remove"
              type="button"
              aria-label={`Remove "${note}"`}
              onClick={() => onChange(notes.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onChange([...notes, text.trim()]);
          setText("");
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_CHAT_LENGTH} placeholder="Track something…" aria-label="New tracker line" />
        <button type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}
