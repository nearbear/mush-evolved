import { CHARACTERS, type PlayerView } from "@mush2/shared";
import { describe, expect, it, test } from "vitest";
import { terminalLogin, terminalUsername } from "../../src/hud/terminalUsername.ts";

test("first initial of the given name plus the surname, lowercase, no spaces", () => {
  expect(terminalUsername("chao")).toBe("cwang");
  expect(terminalUsername("ian")).toBe("isoulton");
  expect(terminalUsername("jinsu")).toBe("jkim");
  expect(terminalUsername("kuanti")).toBe("klai");
});

test("every character gets a plain lowercase name", () => {
  for (const { id } of CHARACTERS) expect(terminalUsername(id)).toMatch(/^[a-z]{3,}$/);
});

describe("terminalLogin", () => {
  // Only the fields terminalLogin reads.
  const view = (character: string, holder: string | null, cheats: string[] = [], hackedEquipment?: string[]) =>
    ({
      you: { character, cheats, skills: [], bookSkill: null, mushSkills: [], ...(hackedEquipment && { hackedEquipment }) },
      titles: [{ id: "commander", holder }],
    }) as unknown as PlayerView;

  it("logs anyone into a terminal without a title", () => {
    expect(terminalLogin("PILGRED", view("chao", "jinsu"))).toEqual({ user: "cwang", access: "granted" });
  });
  it("grants the title holder and limits everyone else", () => {
    expect(terminalLogin("PILOT_MODULE", view("jinsu", "jinsu"))).toEqual({ user: "jkim", access: "granted" });
    expect(terminalLogin("PILOT_MODULE", view("chao", "jinsu"))).toEqual({ user: "cwang", access: "limited" });
    expect(terminalLogin("PILOT_MODULE", view("chao", null))).toEqual({ user: "cwang", access: "limited" });
  });
  it("logs a title bypasser in as the holder", () => {
    expect(terminalLogin("PILOT_MODULE", view("chao", "jinsu", ["freeHacking"]))).toEqual({ user: "jkim", access: "hacked" });
  });
  it("logs a hacker in as the holder (or themselves when vacant) when the equipment is hacked", () => {
    expect(terminalLogin("PILOT_MODULE", view("chao", "jinsu", [], ["BRIDGE:pilot"]), "BRIDGE:pilot")).toEqual({
      user: "jkim",
      access: "hacked",
    });
    expect(terminalLogin("PILOT_MODULE", view("chao", null, [], ["BRIDGE:pilot"]), "BRIDGE:pilot")).toEqual({
      user: "cwang",
      access: "hacked",
    });
    expect(terminalLogin("PILOT_MODULE", view("chao", "jinsu", [], ["OTHER:eq"]), "BRIDGE:pilot")).toEqual({
      user: "cwang",
      access: "limited",
    });
  });
});
