import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_CHAT_LENGTH } from "@mush2/shared";
import { Hint } from "./IconButton.tsx";
import { Markdown } from "./Markdown.tsx";

const CHAT_MIN_LINES = 3;
const CHAT_LINE_PX = 18;
const CHAT_MIN_HEIGHT = CHAT_MIN_LINES * CHAT_LINE_PX + 12;
/** The markdown preview toggle. TODO(preview): off for now. */
const CHAT_PREVIEW: boolean = false;

/** A three-line text area that grows upward (drag the grip above it to make it taller), the preview toggle above it (stubbed out, see CHAT_PREVIEW) and send below. */
export function ChatInput({ enabled, placeholder, onSend }: { enabled: boolean; placeholder: string; onSend: (text: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [height, setHeight] = useState(CHAT_MIN_HEIGHT);
  // Previewing: the thread area splits, rendered markdown above and the text box below (see .chat-previewing).
  const [previewing, setPreviewing] = useState(false);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  const previewLabel = previewing ? t("itrackie.composer.edit") : t("itrackie.composer.preview");
  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };
  return (
    <form
      className={previewing ? "chat-input chat-compose chat-previewing" : "chat-input chat-compose"}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div
        className="chat-grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("itrackie.composer.grip")}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { startY: e.clientY, startHeight: height };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const max = Math.max(CHAT_MIN_HEIGHT, window.innerHeight * 0.6);
          setHeight(Math.min(max, Math.max(CHAT_MIN_HEIGHT, drag.current.startHeight + drag.current.startY - e.clientY)));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      {/* TODO(preview): stubbed out for now, to be revisited; flip CHAT_PREVIEW to bring the toggle back. */}
      {CHAT_PREVIEW && (
        <div className="chat-tools">
          <Hint label={previewLabel}>
            <button className="chat-max" type="button" onClick={() => setPreviewing(!previewing)} aria-pressed={previewing} aria-label={previewLabel} />
          </Hint>
        </div>
      )}
      {previewing && (
        <div className="chat-preview" aria-live="polite">
          {text.trim() ? <Markdown text={text} /> : <p className="sub">{t("itrackie.composer.previewEmpty")}</p>}
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter adds a line. Ignore Enter while an IME is composing.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        style={previewing ? undefined : { height }}
        maxLength={MAX_CHAT_LENGTH}
        placeholder={enabled ? placeholder : "Needs an iTrackie"}
        disabled={!enabled}
        aria-label="Chat message"
      />
      <button className="chat-send" type="submit" disabled={!enabled || !text.trim()} aria-label="Send" />
    </form>
  );
}
