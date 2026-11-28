// Private notes (#503): a button in the room view's lower-right corner (beside the sack on desktop, beside the ship
// button on phones) that opens your notepad in the inventory popover's band, between your ID card and the minimap.
// Up to 16 numbered tabs of free text with a Raw / Preview switch; the preview is chat's markdown, its checkboxes
// clickable. Saved by the store (notes.ts) a second after typing stops, and on switching tabs, closing or hiding the
// page. Readable and editable while dead. Closes on the button, Escape, or a press elsewhere in the room view.

import { useCallback, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_NOTE_LENGTH, MAX_NOTE_TABS, toggleNoteTask } from "@mush2/shared";
import { TAB_ICONS } from "../art/assets.ts";
import { useNotes, useNotesStore } from "../notes.ts";
import { Hint } from "./IconButton.tsx";
import { useBand } from "./InventoryOverlay.tsx";
import { Markdown } from "./Markdown.tsx";
import { useOverlayDismiss } from "./useOverlayDismiss.ts";

export function NotesOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const store = useNotesStore();
  const { notes, loaded } = useNotes(store);
  const [picked, setPicked] = useState(0);
  const [preview, setPreview] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const tab = Math.min(picked, notes.length - 1);
  const text = notes[tab]?.text ?? "";

  const close = useCallback(() => {
    store?.flush();
    onOpenChange(false);
  }, [store, onOpenChange]);
  useOverlayDismiss(open, close, rootRef);
  const band = useBand(open, rootRef);

  // No socket (a replay, the design kit): no notes.
  if (!store) return null;
  const label = t("notes.button");
  const pick = (i: number) => {
    store.flush();
    setPicked(i);
  };
  const edit = (next: string) => store.edit(tab, next);

  return (
    <div className="notes-overlay" ref={rootRef}>
      {open && (
        <section id={panelId} role="dialog" tabIndex={-1} className="panel notes-popup" style={band} aria-label={label}>
          <div className="notes-bar">
            <ul className="notes-tabs" aria-label={t("notes.tabs")}>
              {notes.map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: tabs are only ever added at the end, never moved or removed.
                <li key={i}>
                  <button type="button" className="notes-tab" aria-pressed={i === tab} aria-label={t("notes.tab", { n: i + 1 })} onClick={() => pick(i)}>
                    {i + 1}
                  </button>
                </li>
              ))}
              {notes.length < MAX_NOTE_TABS && (
                <li>
                  <button
                    type="button"
                    className="notes-tab notes-add"
                    aria-label={t("notes.add")}
                    disabled={!loaded}
                    onClick={() => {
                      store.edit(notes.length, "");
                      pick(notes.length);
                    }}
                  >
                    +
                  </button>
                </li>
              )}
            </ul>
            <div className="notes-mode" role="group" aria-label={t("notes.mode")}>
              <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
                {t("notes.raw")}
              </button>
              <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
                {t("notes.preview")}
              </button>
            </div>
          </div>
          {preview ? (
            <div className="notes-preview">{text.trim() ? <Markdown text={text} onToggle={(line) => edit(toggleNoteTask(text, line))} /> : <p className="sub">{t("notes.empty")}</p>}</div>
          ) : (
            <textarea
              className="notes-text"
              value={text}
              maxLength={MAX_NOTE_LENGTH}
              disabled={!loaded}
              placeholder={loaded ? t("notes.placeholder") : t("common.connecting")}
              aria-label={t("notes.tab", { n: tab + 1 })}
              onChange={(e) => edit(e.target.value)}
              onBlur={() => store.flush()}
            />
          )}
          <p className="sub notes-count" aria-live="off">
            {t("notes.count", { length: text.length, max: MAX_NOTE_LENGTH })}
          </p>
        </section>
      )}
      <div className="notes-controls">
        <Hint label={label}>
          <button type="button" className="inventory-toggle" aria-label={label} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => (open ? close() : onOpenChange(true))}>
            <img src={TAB_ICONS.notebook} alt="" />
          </button>
        </Hint>
      </div>
    </div>
  );
}
