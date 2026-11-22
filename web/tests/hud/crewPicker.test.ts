import type { ActionOption, PlayerView } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { collapsePickers } from "../../src/hud/CrewPickerDialog.tsx";
import { optionsOn } from "../../src/hud/targets.ts";

const opt = (action: ActionOption["action"]): ActionOption => ({ action, cost: { ap: 0, mp: 0 }, chance: 1, dirt: 0, injury: 0, tags: [] }) as ActionOption;
const premonition = (subject: string) => opt({ type: "premonition", subject });
const mission = (subordinate: string) => opt({ type: "issue_mission", subordinate });

describe("crew picker actions", () => {
  it("puts Premonition and Issue mission on your own panel, never on the crewmate's, wherever they are", () => {
    const view = { you: { id: "p0" }, actions: [premonition("p1"), premonition("p2"), mission("p1")] } as unknown as PlayerView;
    expect(optionsOn(view, { kind: "player", id: "p0" })).toHaveLength(3);
    expect(optionsOn(view, { kind: "player", id: "p1" })).toEqual([]);
  });

  it("collapses each to one button and keeps every crewmate's option for its picker", () => {
    const other = opt({ type: "search" });
    const { options, picks } = collapsePickers([premonition("p1"), other, premonition("p2"), mission("p3")]);
    expect(options.map((o) => o.action.type)).toEqual(["premonition", "search", "issue_mission"]);
    expect(picks.premonition.map((o) => (o.action as { subject: string }).subject)).toEqual(["p1", "p2"]);
    expect(picks.issue_mission).toHaveLength(1);
  });
});
