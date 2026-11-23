import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlayerView } from "@mush2/shared";
import { GRAVITY_ICON } from "../../src/art/assets.ts";
import { AlertBar, BreakdownAlerts, alertCount } from "../../src/hud/ShipResources.tsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number; mp?: number }) =>
      params?.count !== undefined ? `${key}:${params.count}` : params?.mp !== undefined ? `${key}:${params.mp}` : key,
    i18n: { language: "en" },
  }),
}));

vi.mock("../../src/i18n/names.ts", () => ({
  useNames: () => ({ room: (id: string) => id, equipment: (id: string) => id, characterGiven: (id: string) => id, project: (id: string) => id }),
}));

const ship = { oxygen: 24, fuel: 24, hull: 100, plasmaShield: 0, max: { oxygen: 32, fuel: 24, hull: 100, plasmaShield: 20 } };
const alerts = (broken: number, gravity: PlayerView["alerts"]["gravity"], reports: PlayerView["alerts"]["reports"] = []): PlayerView["alerts"] => ({
  fires: 0,
  broken,
  reports,
  gravity,
});
const tankReport = { kind: "equipment", room: "front_storage", equipment: "OXYGEN_TANK", by: "chun" } as PlayerView["alerts"]["reports"][number];

describe("alerts counter with the Gravity Simulator", () => {
  it("counts a broken simulator once, through broken", () => {
    expect(alertCount(alerts(2, "broken"))).toBe(2);
  });
  it("adds a restarting simulator, which isn't broken", () => {
    expect(alertCount(alerts(0, "restarting"))).toBe(1);
    expect(alertCount(alerts(1, "restarting"))).toBe(2);
  });
  it("counts only breakdowns when gravity is on", () => {
    expect(alertCount(alerts(1, null))).toBe(1);
  });
  it("is not muted while the simulator restarts and nothing else is broken", () => {
    const out = renderToStaticMarkup(<AlertBar ship={ship} hunters={0} alerts={alerts(0, "restarting")} />);
    expect(out).toContain('aria-label="shipResources.alerts: 1"');
    expect(out.match(/class="empty"/g)).toHaveLength(2); // hunters and fires only
  });
});

describe("alerts popover gravity row", () => {
  it("shows the broken row, and doesn't count the simulator as unreported", () => {
    const out = renderToStaticMarkup(<BreakdownAlerts alerts={alerts(2, "broken", [tankReport])} />);
    expect(out).toContain(GRAVITY_ICON);
    expect(out).toContain("shipResources.gravityBroken<");
    expect(out).toContain("shipResources.gravityBrokenText:1");
    expect(out).not.toContain("alertsUnreported");
  });
  it("still counts other unreported breakdowns beside a broken simulator", () => {
    const out = renderToStaticMarkup(<BreakdownAlerts alerts={alerts(3, "broken", [tankReport])} />);
    expect(out).toContain("shipResources.alertsUnreported:1");
  });
  it("shows nothing for a broken simulator alone but its row", () => {
    const out = renderToStaticMarkup(<BreakdownAlerts alerts={alerts(1, "broken")} />);
    expect(out).toContain("shipResources.gravityBroken<");
    expect(out).not.toContain("alert-list");
  });
  it("shows the restarting row", () => {
    const out = renderToStaticMarkup(<BreakdownAlerts alerts={alerts(0, "restarting")} />);
    expect(out).toContain("shipResources.gravityRestarting<");
    expect(out).toContain("shipResources.gravityRestartingText:1");
    expect(out).not.toContain("gravityBroken");
  });
  it("shows no gravity row when gravity is on", () => {
    const out = renderToStaticMarkup(<BreakdownAlerts alerts={alerts(1, null)} />);
    expect(out).not.toContain("gravity");
    expect(out).toContain("shipResources.alertsUnreported:1");
  });
});
