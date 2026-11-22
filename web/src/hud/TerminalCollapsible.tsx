// Reusable collapsible section for terminals (owner, 2026-11-21): uses Base UI's Collapsible, the terminal
// header's deeper cyan (--terminal-header-bg), and less.png/more.png as the open/closed toggle icon.

import { Collapsible } from "@base-ui/react/collapsible";
import { useState, type ReactNode } from "react";
import { COLLAPSE_ICON, EXPAND_ICON } from "../art/assets.ts";
import "./terminal.css";

interface Props {
  /** Label shown on the collapsible bar (already translated). */
  heading: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

export function TerminalCollapsible({ heading, defaultOpen = false, className, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className={className ? `terminal-collapsible ${className}` : "terminal-collapsible"}
    >
      <Collapsible.Trigger className="terminal-collapsible-trigger">
        <img
          className="terminal-collapsible-icon"
          src={open ? COLLAPSE_ICON : EXPAND_ICON}
          width={16}
          height={16}
          alt=""
        />
        <span className="terminal-collapsible-heading">{heading}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="terminal-collapsible-panel">{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}
