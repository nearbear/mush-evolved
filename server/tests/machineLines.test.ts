import { describe, expect, it } from "vitest";
import { formatFireLine } from "../src/bots/fireShare.ts";
import { formatItemLine } from "../src/bots/itemShare.ts";
import { isMachineLine } from "../src/bots/machineLines.ts";
import { CANCEL_HOLD_LINE, HOLD_JUMP_LINE, JUMP_NOW_LINE } from "../src/bots/planetShare.ts";
import { formatTankLine, TANK_ROOMS } from "../src/bots/tankShare.ts";

describe("isMachineLine", () => {
  it("knows every bots' line format", () => {
    const lines = [
      formatItemLine({ type: "metal_scraps", room: "LABORATORY", present: true }),
      formatItemLine({ type: "metal_scraps", room: "LABORATORY", present: false }),
      formatFireLine({ room: "LABORATORY" }),
      formatTankLine({ kind: "claim", room: TANK_ROOMS[0]! }),
      formatTankLine({ kind: "fine", room: TANK_ROOMS[0]! }),
      HOLD_JUMP_LINE,
      JUMP_NOW_LINE,
      CANCEL_HOLD_LINE,
    ];
    for (const line of lines) expect(isMachineLine(line), line).toBe(true);
  });

  it("lets ordinary chat through", () => {
    for (const line of ["hello", "Fire in the kitchen!", "who has the scrap?"]) expect(isMachineLine(line), line).toBe(false);
  });
});
