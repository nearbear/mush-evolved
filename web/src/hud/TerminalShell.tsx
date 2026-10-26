// The frame every terminal shares: a title bar (terminal name, room, close), a cosmetic login banner, then the
// terminal's own content. Terminals supply only their body; no game logic lives here.

import { Dialog } from "@base-ui/react/dialog";
import { bypassesTitles, EQUIPMENT_TYPES, type PlayerView } from "@mush2/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { terminalUsername } from "./terminalUsername.ts";

interface Props {
  /** The terminal's name, already translated. */
  name: string;
  type: string;
  view: PlayerView;
  children: ReactNode;
}

export function TerminalShell({ name, type, view, children }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <div className="terminal-scroll">
      <header className="dialog-header terminal-header">
        <Dialog.Title className="settings-title">{name}</Dialog.Title>
        <span className="terminal-room">{names.room(view.you.room)}</span>
        <Dialog.Close className="dialog-header-close" aria-label={t("terminal.close")}>
          ×
        </Dialog.Close>
      </header>
      <TerminalLogin type={type} view={view} />
      {children}
    </div>
  );
}

/**
 * Purely cosmetic: a login for the current character. A terminal that needs a title says access is limited to anyone
 * who doesn't hold it, unless they got in with the hacker kit, which logs them in as the holder (when there is one).
 */
function TerminalLogin({ type, view }: { type: string; view: PlayerView }) {
  const { t } = useTranslation();
  const title = EQUIPMENT_TYPES[type]?.title;
  const holder = title ? view.titles.find((entry) => entry.id === title)?.holder : null;
  const mine = view.you.character;
  const hacked = !!title && holder !== mine && holder != null && bypassesTitles(view.you);
  const user = terminalUsername(hacked ? holder : mine);
  const limited = !!title && holder !== mine && !hacked;
  return (
    <pre className="terminal-login" aria-hidden="true">
      {t("terminal.login.user", { user })}
      {"\n"}
      {t(hacked ? "terminal.login.hacked" : limited ? "terminal.login.limited" : "terminal.login.granted", { user })}
    </pre>
  );
}
