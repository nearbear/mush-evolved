import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerClockContext, serverTime, type ServerClock } from "../../src/hud/serverClock.ts";
import { countdownText, useCountdown } from "../../src/hud/useCountdown.ts";
import { ActionBar } from "../../src/scene/ActionBar.tsx";

afterEach(() => vi.useRealTimers());

const LOCAL = 1_000_000;
const withClock = (clock: ServerClock, node: React.ReactNode) => renderToStaticMarkup(<ServerClockContext.Provider value={clock}>{node}</ServerClockContext.Provider>);

function Countdown({ at }: { at: number }) {
  return <>{useCountdown(at)}</>;
}

describe("serverTime", () => {
  it("is our clock plus the offset when live", () => {
    expect(serverTime({ offset: 500 }, LOCAL)).toBe(LOCAL + 500);
  });
  it("is the frozen time whatever our clock says", () => {
    expect(serverTime({ frozen: 42 }, LOCAL)).toBe(42);
    expect(serverTime({ frozen: 42 }, LOCAL + 60_000)).toBe(42);
  });
});

describe("countdownText", () => {
  it("is h:mm:ss, rounded up, never negative", () => {
    expect(countdownText(3_723_000, 0)).toBe("1:02:03");
    expect(countdownText(1_500, 0)).toBe("0:00:02");
    expect(countdownText(0, 5_000)).toBe("0:00:00");
  });
});

describe("useCountdown", () => {
  it("counts from the frozen time, not ours", () => {
    vi.useFakeTimers({ now: LOCAL });
    expect(withClock({ frozen: 10_000 }, <Countdown at={70_000} />)).toBe("0:01:00");
  });
  it("counts from our clock plus the offset when live", () => {
    vi.useFakeTimers({ now: LOCAL });
    expect(withClock({ offset: 2_000 }, <Countdown at={LOCAL + 62_000} />)).toBe("0:01:00");
  });
});

describe("ActionBar", () => {
  const bar = { since: 10_000, until: 20_000 };
  it("is paused at the frozen point", () => {
    vi.useFakeTimers({ now: LOCAL });
    const out = withClock({ frozen: 14_000 }, <ActionBar bar={bar} label="Working" />);
    expect(out).toContain("--bar-delay:-4000ms");
    expect(out).toContain("animation-play-state:paused");
  });
  it("fills across a playing replay step at step speed", () => {
    vi.useFakeTimers({ now: LOCAL });
    // 0.2 -> 0.7 over 250ms maps to a 500ms 0 -> 1 animation starting at -100ms.
    const out = withClock({ frozen: 12_000, step: { to: 17_000, durationMs: 250 } }, <ActionBar bar={bar} label="Working" />);
    expect(out).toContain("--bar-ms:500ms");
    expect(out).toContain("--bar-delay:-100ms");
    expect(out).not.toContain("paused");
  });
  it("caps a playing replay step at full when the next stop is past the bar's end", () => {
    const out = withClock({ frozen: 10_000, step: { to: 25_000, durationMs: 125 } }, <ActionBar bar={bar} label="Working" />);
    expect(out).toContain("--bar-ms:125ms");
    expect(out).toContain("--bar-delay:0ms");
  });
  it("stays paused if the bar is already full during a playing replay step", () => {
    const out = withClock({ frozen: 20_000, step: { to: 25_000, durationMs: 250 } }, <ActionBar bar={bar} label="Working" />);
    expect(out).toContain("--bar-delay:-10000ms");
    expect(out).toContain("animation-play-state:paused");
  });
  it("runs from our clock plus the offset when live", () => {
    vi.useFakeTimers({ now: 13_000 });
    const out = withClock({ offset: 1_000 }, <ActionBar bar={bar} label="Working" />);
    expect(out).toContain("--bar-delay:-4000ms");
    expect(out).not.toContain("paused");
  });
});
