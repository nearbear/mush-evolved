import type { OtherPlayerView } from "@mush2/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CREW_ICONS } from "../../src/art/assets.ts";
import { CrewBar, crewGroups } from "../../src/hud/CrewBar.tsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: { count?: number }) => `${key}:${o?.count ?? ""}`, i18n: { language: "en" } }),
}));
vi.mock("../../src/i18n/names.ts", () => ({ useNames: () => ({ characterGiven: (id: string) => id }) }));

const other = (character: string, alive: boolean, mush = false) =>
  ({ id: character, isBot: false, character, alive, ready: false, statuses: [], skills: [], ...(mush ? { mush: true } : {}) }) as OtherPlayerView;

describe("crewGroups", () => {
  it("groups by the view's mush flag, you included, and counts empty seats as cryo", () => {
    const players = [other("chun", true), other("hua", true, true), other("ian", false), other("kuanti", false, true)];
    const groups = crewGroups({ players, youCharacter: "jinsu", youRole: "mush", youAlive: true, seats: 8 });
    expect(groups).toEqual({
      characters: { alive: ["chun"], mush: ["jinsu", "hua"], cryo: [], dead: ["ian"], deadMush: ["kuanti"] },
      cryo: 3,
    });
  });

  it("shows a human only alive and dead: without the flag nobody is Mush", () => {
    const players = [other("chun", true), other("ian", false)];
    const groups = crewGroups({ players, youCharacter: "jinsu", youRole: "human", youAlive: false, seats: 3 });
    expect(groups.characters).toEqual({ alive: ["chun"], mush: [], cryo: [], dead: ["jinsu", "ian"], deadMush: [] });
    expect(groups.cryo).toBe(0);
  });
});

describe("CrewBar", () => {
  it("draws one figure per seat, grouped alive, Mush, cryo, dead, dead Mush", () => {
    const out = renderToStaticMarkup(
      <CrewBar players={[other("ian", false), other("chun", true)]} youCharacter="jinsu" youRole="human" youAlive seats={4} />,
    );
    const icons = [...out.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    expect(icons).toEqual([CREW_ICONS.alive, CREW_ICONS.alive, CREW_ICONS.cryo, CREW_ICONS.dead]);
    expect(out).toContain('aria-label="crew.label:"');
  });
});
