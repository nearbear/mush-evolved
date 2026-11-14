// The terminal frame as a modal, the owner's preferred modal style (web/CLAUDE.md): the iTrackie's glowing kit-panel
// around the light cut card, a fixed title bar (title left, × right), a scrolling body, and the gold outline
// (TabOutline) from the title bar down. The styles are in terminal.css and settings.css.
// The caller keeps Dialog.Root (open state, and a Dialog.Trigger if it has one) and puts this inside it; `children` is
// the body. A body that is a single `.settings-tabs` Tabs.Root puts its tabs on the tab line (SettingsDialog).
// Terminals use TerminalFrame instead, whose title bar also has the login and the terminal's icon.

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { DialogHeader } from "./DialogHeader.tsx";
import { TabOutline } from "./TabOutline.tsx";
import "./settings.css";
import "./terminal.css";

export function FramedDialog({
  heading,
  closeLabel,
  className,
  children,
}: {
  heading: string;
  closeLabel: string;
  /** Extra classes on the popup, e.g. for its width. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="settings-backdrop" />
      <Dialog.Popup className={className ? `settings-popup terminal-popup kit-panel ${className}` : "settings-popup terminal-popup kit-panel"}>
        <div className="cut-card cut-top terminal-card terminal-outlined">
          <div className="terminal-top">
            <DialogHeader className="terminal-header" heading={heading} closeLabel={closeLabel} />
          </div>
          <div className="terminal-body">{children}</div>
        </div>
        <TabOutline shape="cut" line=".terminal-body" />
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
