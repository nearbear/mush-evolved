import { describe, expect, it } from "vitest";
import { giveItems, giveTitle, pickSkills, sampleState, sampleView, spend } from "../../src/designKit/sampleView.ts";

// The kit's fixture: if a rules change breaks a setup step, this fails before the kit page does.
describe("design kit sample view", () => {
  it("is a launched 16-seat ship with 2 Mush, seen from p0", () => {
    const state = sampleState();
    expect(state.players).toHaveLength(16);
    expect(state.players.filter((p) => p.role === "mush")).toHaveLength(2);
    const view = sampleView(state);
    expect(view.you.character).toBe("jinsu");
    expect(view.you.role).toBe("human");
    expect(view.preselection).toBe(false);
  });

  it("forces the kit seat's role and character", () => {
    const view = sampleView(sampleState({ role: "mush", character: "kuanti" }));
    expect(view.you.role).toBe("mush");
    expect(view.you.character).toBe("kuanti");
  });

  it("applies each helper", () => {
    const before = sampleView();
    const view = sampleView(spend(giveTitle(giveItems(pickSkills(sampleState(), ["pilot"]), ["coffee"]), "commander"), { ap: 3, mp: 1 }));
    expect(view.you.ap).toBe(before.you.ap - 3);
    expect(view.you.mp).toBe(before.you.mp - 1);
    expect(view.you.skills).toContain("pilot");
    expect(view.titles.find((t) => t.id === "commander")?.holder).toBe("jinsu");
    expect(view.inventory.map((i) => i.type)).toContain("coffee");
  });
});
