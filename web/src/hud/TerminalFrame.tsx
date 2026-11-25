// The frame every terminal shares: the cut card with a title bar (the terminal's name, with any actions and close on its
// row, over a cosmetic login, with the icon beside that), which stays put, then the terminal's own content, which scrolls (a tabbed terminal's panels scroll
// under its tabs instead), and the gold outline (TabOutline), which starts at the tab line under the title bar.
// Pure props, no game state and no dialog context, so the design kit can show it on its own: TerminalDialog works out
// the login (terminalLogin in terminalUsername.ts) and labels its popup with `titleId`. Terminals supply only their body.
// Put it inside a `.terminal-popup.kit-panel` (the dialog's popup, or a stand-in on the design kit page); TabOutline
// measures that element. Remount it per terminal (`key`) so the outline starts fresh.

import { type ReactNode, type RefObject, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TabOutline } from "./TabOutline.tsx";
import type { TerminalLogin } from "./terminalUsername.ts";
import "./settings.css";
import "./terminal.css";

interface Props {
  /** The terminal's name, already translated. */
  name: string;
  /** The equipment type: picks the icon and corner art (terminal.css's `.terminal-<type>`). */
  type: string;
  login: TerminalLogin;
  onClose: () => void;
  /** The heading's id, for the dialog's aria-labelledby; one is made up when absent. */
  titleId?: string;
  /** Buttons on the title row, left of close (the phone's inventory sack). */
  actions?: ReactNode;
  /** A panel drawn over the body, under the title bar (the inventory, opened from a terminal). */
  overlay?: ReactNode;
  children: ReactNode;
}

export function TerminalFrame({ name, type, login, onClose, titleId, actions, overlay, children }: Props) {
  const { t } = useTranslation();
  const ownId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const overlayTop = useOverlayTop(overlay != null, cardRef, topRef);
  return (
    <>
      <div ref={cardRef} className={`cut-card cut-top terminal-card terminal-outlined terminal-${type.toLowerCase()}`}>
        <div ref={topRef} className="terminal-top">
          <header className="dialog-header terminal-header">
            <div className="terminal-heading">
              <h2 id={titleId ?? ownId} className="terminal-title">
                {name}
              </h2>
              <LoginBanner login={login} />
            </div>
            <div className="terminal-header-actions">
              {actions}
              <button type="button" className="dialog-header-close" aria-label={t("terminal.close")} onClick={onClose} />
            </div>
            <span className="terminal-icon" aria-hidden="true" />
          </header>
        </div>
        <div className="terminal-body">{children}</div>
      </div>
      <TabOutline shape="cut" line=".terminal-body" />
      {overlay != null && (
        <div className="terminal-overlay" style={overlayTop === undefined ? undefined : { top: overlayTop }}>
          {overlay}
        </div>
      )}
    </>
  );
}

/**
 * The overlay's top inside the popup: the title bar's bottom (the tab line). The card is the title bar's offset parent
 * and the popup the card's, so the offsets add up; re-measured when the title bar resizes (the login wraps).
 */
function useOverlayTop(shown: boolean, cardRef: RefObject<HTMLDivElement | null>, topRef: RefObject<HTMLDivElement | null>) {
  const [top, setTop] = useState<number>();
  useLayoutEffect(() => {
    const card = cardRef.current;
    const bar = topRef.current;
    if (!shown || !card || !bar) return;
    const measure = () => setTop(card.offsetTop + bar.offsetTop + bar.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [shown, cardRef, topRef]);
  return top;
}

/** Purely cosmetic. */
function LoginBanner({ login: { user, access } }: { login: TerminalLogin }) {
  const { t } = useTranslation();
  return (
    <pre className="terminal-login" aria-hidden="true">
      {"> "}
      {t("terminal.login.user", { user })}
      {"\n> "}
      {access === "hacked"
        ? t("terminal.login.hacked", { user })
        : access === "limited"
          ? t("terminal.login.limited", { user })
          : t("terminal.login.granted", { user })}
    </pre>
  );
}
