// Actions take two presses, so a stray click or tap never spends points (owner, 2026-11-11). Built on `click`
// rather than `dblclick` so it works the same for a mouse, two taps on a touch screen (buttons have
// `touch-action: manipulation`, so the second tap isn't eaten as a zoom), and two Enter or Space presses.
// The first press arms the button (`data-armed`, drawn pressed in buttons.css); a second one in time fires.
// Actions in `SINGLE_PRESS_ACTIONS` are the exception: they cost nothing and are easy to undo, so one press does them.

import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { Action } from "@mush2/shared";

/**
 * Action types too inconsequential to need the second press (owner, 2026-11-14): free, and undone by closing a window.
 * `access` only opens a terminal's window (and sits you at it).
 */
export const SINGLE_PRESS_ACTIONS: ReadonlySet<Action["type"]> = new Set<Action["type"]>(["access", "throw_out", "issue_mission", "premonition"]);

/** A mouse or touch double press must land within this, like the usual OS double-click speed. */
export const DOUBLE_PRESS_MS = 500;
/** Keyboard and screen-reader presses (`detail` 0) get longer: pressing a key twice is slower than clicking. */
export const DOUBLE_PRESS_KEY_MS = 1500;

/**
 * `onClick` for a button that fires `fire` on its second press in quick succession, and whether it's armed.
 * With `single`, the first press fires (for `SINGLE_PRESS_ACTIONS`); it's a flag rather than a separate hook so a
 * button can switch between the two without breaking the rules of hooks.
 */
export function useDoublePress(fire: () => void, single = false): { onClick: (e: MouseEvent) => void; armed: boolean } {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onClick = (e: MouseEvent) => {
    clearTimeout(timer.current);
    if (armed || single) {
      setArmed(false);
      fire();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), e.detail === 0 ? DOUBLE_PRESS_KEY_MS : DOUBLE_PRESS_MS);
  };
  return { onClick, armed };
}

/** A plain button that fires on a double press. */
export function DoublePressButton({ onPress, className, children, ...rest }: { onPress: () => void; className?: string | undefined; children: ReactNode; "aria-label"?: string }) {
  const { onClick, armed } = useDoublePress(onPress);
  return (
    <button type="button" className={className} data-armed={armed ? "" : undefined} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}
