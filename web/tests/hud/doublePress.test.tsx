// @vitest-environment jsdom
//
// `useDoublePress` (hud/DoublePress.tsx): actions take two presses, except the `SINGLE_PRESS_ACTIONS`, which take one.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOUBLE_PRESS_MS, SINGLE_PRESS_ACTIONS, useDoublePress } from "../../src/hud/DoublePress.tsx";
import { doublePressTipDue, HINT_AFTER_LAPSES, resetDoublePressCount, setSinglePress } from "../../src/pressMode.ts";

function Probe({ fire, single }: { fire: () => void; single?: boolean }) {
  const { onClick, armed } = useDoublePress(fire, single);
  return (
    <button type="button" data-armed={armed ? "" : undefined} onClick={onClick}>
      go
    </button>
  );
}

afterEach(cleanup);

describe("useDoublePress", () => {
  it("arms on the first press and fires on the second", () => {
    const fire = vi.fn();
    render(<Probe fire={fire} />);
    const button = screen.getByRole("button");
    fireEvent.click(button, { detail: 1 });
    expect(fire).not.toHaveBeenCalled();
    expect(button.hasAttribute("data-armed")).toBe(true);
    fireEvent.click(button, { detail: 2 });
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("fires on the first press when single, without arming", () => {
    const fire = vi.fn();
    render(<Probe fire={fire} single />);
    const button = screen.getByRole("button");
    fireEvent.click(button, { detail: 1 });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute("data-armed")).toBe(false);
  });

  it("raises the double press tip after lone presses that lapse, and an action clears it", () => {
    vi.useFakeTimers();
    try {
      setSinglePress(false);
      resetDoublePressCount();
      const fire = vi.fn();
      render(<Probe fire={fire} />);
      const button = screen.getByRole("button");
      for (let i = 0; i < HINT_AFTER_LAPSES; i++) {
        fireEvent.click(button, { detail: 1 });
        act(() => vi.advanceTimersByTime(DOUBLE_PRESS_MS + 1));
      }
      expect(fire).not.toHaveBeenCalled();
      expect(doublePressTipDue()).toBe(true);
      fireEvent.click(button, { detail: 1 });
      fireEvent.click(button, { detail: 2 });
      expect(fire).toHaveBeenCalledTimes(1);
      expect(doublePressTipDue()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists accessing a terminal as a single-press action", () => {
    expect(SINGLE_PRESS_ACTIONS.has("access")).toBe(true);
  });
});
