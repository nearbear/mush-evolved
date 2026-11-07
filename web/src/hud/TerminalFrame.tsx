// The frame every terminal shares: the cut card with a title bar (the terminal's name over a cosmetic login; close, and
// the icon under it), which stays put, then the terminal's own content, which scrolls (a tabbed terminal's panels scroll
// under its tabs instead), and the gold outline (TabOutline), which starts at the tab line under the title bar.
// Pure props, no game state and no dialog context, so the design kit can show it on its own: TerminalDialog works out
// the login (terminalLogin in terminalUsername.ts) and labels its popup with `titleId`. Terminals supply only their body.
// Put it inside a `.terminal-popup.kit-panel` (the dialog's popup, or a stand-in on the design kit page); TabOutline
// measures that element. Remount it per terminal (`key`) so the outline starts fresh.

import { useId, type ReactNode } from "react";
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
  children: ReactNode;
}

export function TerminalFrame({ name, type, login, onClose, titleId, children }: Props) {
  const { t } = useTranslation();
  const ownId = useId();
  return (
    <>
      <div className={`cut-card cut-top terminal-card terminal-outlined terminal-${type.toLowerCase()}`}>
        <div className="terminal-top">
          <header className="dialog-header terminal-header">
            <div className="terminal-heading">
              <h2 id={titleId ?? ownId} className="terminal-title">
                {name}
              </h2>
              <LoginBanner login={login} />
            </div>
            <button type="button" className="dialog-header-close" aria-label={t("terminal.close")} onClick={onClose}>
              ×
            </button>
            <span className="terminal-icon" aria-hidden="true" />
          </header>
        </div>
        <div className="terminal-body">{children}</div>
      </div>
      <TabOutline shape="cut" line=".terminal-body" />
    </>
  );
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
