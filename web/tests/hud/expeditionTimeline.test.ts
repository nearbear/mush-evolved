import type { ExpeditionEvent } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { latestColumn, timelineColumns } from "../../src/hud/expeditionTimeline.ts";

const landing: ExpeditionEvent = { sector: "LANDING", kind: "nothing" };
const forest: ExpeditionEvent = { sector: "FOREST", kind: "harvest", item: "banana", amount: 2 };
const again: ExpeditionEvent = { sector: "RUINS", kind: "again" };
const kinds = (input: Parameters<typeof timelineColumns>[0]) => timelineColumns(input).map((c) => c.kind);

describe("timelineColumns", () => {
  it("lays out the steps, the next, the ones left, then Return", () => {
    const columns = timelineColumns({ events: [landing, forest], lost: false, returnAt: 9, next: "OCEAN", nextAt: 5, steps: 3 });
    expect(columns.map((c) => c.kind)).toEqual(["step", "step", "next", "later", "later", "return"]);
    expect(columns[2]).toEqual({ kind: "next", tag: "OCEAN", at: 5 });
    expect(latestColumn(columns)).toBe(1);
  });

  it("draws one mystery step while the view doesn't say how many are left", () => {
    expect(kinds({ events: [landing], lost: false, returnAt: 9 })).toEqual(["step", "next", "return"]);
  });

  it("opens on the next step before the landing resolves", () => {
    expect(latestColumn(timelineColumns({ events: [], lost: false, returnAt: 9 }))).toBe(0);
  });

  it("ends after a U-turn or turning back, or with no step left", () => {
    expect(kinds({ events: [landing, { sector: "U_TURN", kind: "uTurn", who: "chun" }], lost: false, returnAt: 9 })).toEqual(["step", "step", "return"]);
    expect(kinds({ events: [landing, { sector: "FOREST", kind: "back" }], lost: false, returnAt: 9, steps: 2 })).toEqual(["step", "step", "return"]);
    expect(kinds({ events: [landing], lost: false, returnAt: 9, steps: 0 })).toEqual(["step", "return"]);
  });

  it("stops a lost member's timeline at their last line, with no return", () => {
    const columns = timelineColumns({ events: [landing, { sector: "FOREST", kind: "lost", who: "chun" }], lost: true, returnAt: 0, steps: 4 });
    expect(columns.map((c) => c.kind)).toEqual(["step", "step"]);
    expect(columns[1]).toMatchObject({ badge: "lost" });
  });

  it("badges a sector that can come up again", () => {
    expect(timelineColumns({ events: [again], lost: false, returnAt: 9 })[0]).toMatchObject({ badge: "again" });
  });
});
