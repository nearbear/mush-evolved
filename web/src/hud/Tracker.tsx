import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_CHAT_LENGTH } from "@mush2/shared";

/** The feature's tracker: a list of lines the player types in themselves. */
export function Tracker({ notes, onChange }: { notes: string[]; onChange: (notes: string[]) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  return (
    <div className="tracker">
      <ul className="tracker-list">
        {notes.length === 0 && <li className="sub">{t("itrackie.nothingTracked")}</li>}
        {notes.map((note, i) => (
          <li key={i}>
            <span>{note}</span>
            <button
              className="tracker-remove"
              type="button"
              aria-label={t("itrackie.removeNote", { note })}
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
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_CHAT_LENGTH} placeholder={t("itrackie.trackPlaceholder")} aria-label={t("itrackie.newTrackerLine")} />
        <button type="submit" disabled={!text.trim()}>
          {t("itrackie.add")}
        </button>
      </form>
    </div>
  );
}
