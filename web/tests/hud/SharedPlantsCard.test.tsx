// @vitest-environment jsdom
//
// The pinned Botany status card sorts the sharer's free-text effects: "+N <resource>" lines become an amount then the
// resource's icon (`StatAmount`); everything else (cures, ailment odds) becomes caption text.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { viewFor, type SharedPlantStatus } from "@mush2/shared";
import "../../src/i18n/index.ts";
import { SharedPlantsCard } from "../../src/hud/SharedPlantsCard.tsx";
import { SAMPLE_SEAT, sampleState } from "../../src/designKit/sampleView.ts";

afterEach(() => cleanup());

describe("SharedPlantsCard", () => {
  it("draws known resources as amount then icon, unknown ones as text, and the rest as captions", () => {
    const view = viewFor(sampleState({}), SAMPLE_SEAT);
    const shared: SharedPlantStatus = {
      by: SAMPLE_SEAT,
      day: 1,
      cycleOfDay: 1,
      text: "",
      plants: [
        {
          species: "fruit_banana",
          effects: "+1 AP\n−2 Morale\n+1 Spores\nSpace Rabies (65%)",
          thirst: 0,
          sickCycles: null,
          young: false,
        },
      ],
    };
    const { container } = render(<SharedPlantsCard shared={shared} view={view} />);
    const items = [...container.querySelectorAll(".stat-amounts li")].map((li) => ({
      text: li.querySelector("span")?.textContent,
      icon: li.querySelector("img")?.getAttribute("alt") ?? null,
    }));
    expect(items).toEqual([
      { text: "+1", icon: "AP" },
      { text: "−2", icon: "Morale" },
      { text: "+1 Spores", icon: null },
    ]);
    expect([...container.querySelectorAll(".plant-row-notes li")].map((li) => li.textContent)).toEqual([
      "Space Rabies (65%)",
    ]);
  });
});
