// @vitest-environment jsdom
//
// Component tests for alien fruit tooltips and planted hydropot inspect info (#437).
// Uses real `createGame` + `viewFor` rules views and real English i18n translations.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { viewFor, type FruitEffect, type PlayerView } from "@mush2/shared";
import "../../src/i18n/index.ts";
import { ConsumeEffects } from "../../src/hud/ConsumeEffects.tsx";
import { PlantStates } from "../../src/hud/PlantStates.tsx";
import { SAMPLE_SEAT, sampleState } from "../../src/designKit/sampleView.ts";

const SAMPLE_EFFECT: FruitEffect = {
  ap: 2,
  morale: -2,
  hp: 1,
  buffs: ["treat_disease", "perception"],
  diseases: [
    { id: "space_rabies_disease", odds: 0.65 },
    { id: "fungal_infection_disease", odds: 0.3 },
  ],
  growCycles: 16,
};

function makeView({
  role = "human",
  skills = [],
  bookSkill = null,
}: {
  role?: "human" | "mush";
  skills?: string[];
  bookSkill?: string | null;
} = {}): PlayerView {
  const state = sampleState({ role });
  const player = state.players.find((p) => p.id === SAMPLE_SEAT)!;
  player.skills = skills;
  player.bookSkill = bookSkill;
  state.fruits.fruit01 = SAMPLE_EFFECT;
  return viewFor(state, SAMPLE_SEAT);
}

afterEach(() => {
  cleanup();
});

describe("ConsumeEffects for alien fruits (#437)", () => {
  it("hides fruit effects and base stats for a non-lore human, while fruit_banana shows fixed stats", () => {
    const view = makeView();
    expect(view.fruitEffects).toBeNull();

    const alien = render(<ConsumeEffects type="fruit01" view={view} />);
    expect(alien.container.querySelector(".consume-unknown")?.textContent).toContain("Effects are unknown");
    expect(alien.container.querySelector(".consume-effects")).toBeNull();
    expect(alien.container.querySelector(".consume-mush-warning")).toBeNull();

    const banana = render(<ConsumeEffects type="fruit_banana" view={view} />);
    const bananaItems = [...banana.container.querySelectorAll(".consume-effects li")].map((li) => ({
      stat: li.querySelector("img")?.getAttribute("alt"),
      delta: li.querySelector("span")?.textContent,
    }));
    expect(bananaItems).toEqual([
      { stat: "AP", delta: "+1" },
      { stat: "Satiety", delta: "+1" },
      { stat: "Morale", delta: "+1" },
      { stat: "HP", delta: "+1" },
    ]);
  });

  it("shows combined stats, negative morale, buffs, disease %, and growCycles without Mush warning for lore humans", () => {
    for (const opts of [{ skills: ["botanic"] }, { skills: ["cook"] }, { bookSkill: "skilful" }]) {
      const view = makeView(opts);
      expect(view.fruitEffects?.fruit01).toEqual(SAMPLE_EFFECT);

      const { container, unmount } = render(<ConsumeEffects type="fruit01" view={view} />);
      const stats = [...container.querySelectorAll(".consume-effects li")].map((li) => ({
        stat: li.querySelector("img")?.getAttribute("alt"),
        delta: li.querySelector("span")?.textContent,
      }));
      expect(stats).toEqual([
        { stat: "AP", delta: "+3" },
        { stat: "Satiety", delta: "+1" },
        { stat: "Morale", delta: "−2" },
        { stat: "HP", delta: "+1" },
      ]);
      const buffs = [...container.querySelectorAll(".consume-buffs li")].map((li) => li.textContent);
      expect(buffs).toEqual([
        "Treat Disease (diseases heal 1 cycle faster per cycle for 4 cycles)",
        "Perception (+10% action success chance for 2 cycles)",
      ]);
      expect(container.querySelector(".consume-diseases")?.textContent).toBe(
        "Space Rabies (65%), Fungal Infection (30%)",
      );
      expect(container.querySelector(".consume-grow")?.textContent).toBe("Maturation: 16 cycles");
      expect(container.querySelector(".consume-mush-warning")).toBeNull();
      unmount();
    }
  });

  it("shows the Mush danger warning only when a Mush lacks all human fruit lore skills", () => {
    const mushNoLore = makeView({ role: "mush" });
    expect(mushNoLore.fruitEffects?.fruit01).toEqual(SAMPLE_EFFECT);
    const renderedNoLore = render(<ConsumeEffects type="fruit01" view={mushNoLore} />);
    expect(renderedNoLore.container.querySelector(".consume-grow")?.textContent).toBe("Maturation: 16 cycles");
    expect(renderedNoLore.container.querySelector(".consume-mush-warning")?.textContent).toContain("Mush knowledge:");

    const mushWithSkill = makeView({ role: "mush", skills: ["botanic"] });
    const renderedSkill = render(<ConsumeEffects type="fruit01" view={mushWithSkill} />);
    expect(renderedSkill.container.querySelector(".consume-grow")?.textContent).toBe("Maturation: 16 cycles");
    expect(renderedSkill.container.querySelector(".consume-mush-warning")).toBeNull();

    const mushWithBook = makeView({ role: "mush", bookSkill: "skilful" });
    const renderedBook = render(<ConsumeEffects type="fruit01" view={mushWithBook} />);
    expect(renderedBook.container.querySelector(".consume-grow")?.textContent).toBe("Maturation: 16 cycles");
    expect(renderedBook.container.querySelector(".consume-mush-warning")).toBeNull();
  });

  it("renders positive morale deltas accurately", () => {
    const view = makeView({ skills: ["botanic"] });
    view.fruitEffects!.fruit02 = {
      ap: 0,
      morale: 3,
      hp: 0,
      buffs: ["energize", "resistance"],
      diseases: [],
      growCycles: 20,
    };
    const { container } = render(<ConsumeEffects type="fruit02" view={view} />);
    const stats = [...container.querySelectorAll(".consume-effects li")].map((li) => ({
      stat: li.querySelector("img")?.getAttribute("alt"),
      delta: li.querySelector("span")?.textContent,
    }));
    expect(stats).toEqual([
      { stat: "AP", delta: "+1" },
      { stat: "Satiety", delta: "+1" },
      { stat: "Morale", delta: "+3" },
    ]);
    expect(container.querySelector(".consume-diseases")).toBeNull();
  });
});

describe("PlantStates grow cycles for planted alien fruits (#437)", () => {
  it("shows growCycles and conditional Mush warning when inspecting a planted hydropot", () => {
    const plant = { species: "fruit01", age: 2, thirst: 0 };

    const plainHuman = render(<PlantStates plant={plant} view={makeView()} />);
    expect(plainHuman.container.querySelector(".consume-grow")).toBeNull();
    expect(plainHuman.container.querySelector(".consume-mush-warning")).toBeNull();

    const loreHuman = render(<PlantStates plant={plant} view={makeView({ skills: ["cook"] })} />);
    expect(loreHuman.container.querySelector(".consume-grow")?.textContent).toBe("Maturation: 16 cycles");
    expect(loreHuman.container.querySelector(".consume-mush-warning")).toBeNull();

    const mushNoLore = render(<PlantStates plant={{ species: "fruit01", age: null, thirst: 0 }} view={makeView({ role: "mush" })} />);
    expect(mushNoLore.container.querySelector(".consume-grow")?.textContent).toBe("Maturation: 16 cycles");
    expect(mushNoLore.container.querySelector(".consume-mush-warning")?.textContent).toContain("Mush knowledge:");
  });
});
