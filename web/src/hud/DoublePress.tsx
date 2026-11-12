// Actions take two presses, so a stray click or tap never spends points (owner, 2026-11-11). Built on `click`
// rather than `dblclick` so it works the same for a mouse, two taps on a touch screen (buttons have
// `touch-action: manipulation`, so the second tap isn't eaten as a zoom), and two Enter or Space presses.
// The first press arms the button (`data-armed`, drawn pressed in buttons.css); a second one in time fires.

import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";

/** A mouse or touch double press must land within this, like the usual OS double-click speed. */
export const DOUBLE_PRESS_MS = 500;
/** Keyboard and screen-reader presses (`detail` 0) get longer: pressing a key twice is slower than clicking. */
export const DOUBLE_PRESS_KEY_MS = 1500;

/** `onClick` for a button that fires `fire` on its second press in quick succession, and whether it's armed. */
export function useDoublePress(fire: () => void): { onClick: (e: MouseEvent) => void; armed: boolean } {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onClick = (e: MouseEvent) => {
    clearTimeout(timer.current);
    if (armed) {
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
