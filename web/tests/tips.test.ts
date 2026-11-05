import { describe, expect, it } from "vitest";
import type { Tip } from "@mush2/shared";
import { dismissed, forgetEnded, muted, parseTipPrefs, shownTip, type TipPrefs } from "../src/tips.ts";

const prefs: TipPrefs = { on: true, muted: [], snoozed: [] };
const tips: Tip[] = [{ id: "eat" }, { id: "rest" }, { id: "welcome" }];

describe("tip preferences", () => {
  it("shows the first tip that isn't muted or snoozed, and none when tips are off", () => {
    expect(shownTip(tips, prefs)?.id).toBe("eat");
    expect(shownTip(tips, { ...prefs, snoozed: ["eat"], muted: ["rest"] })?.id).toBe("welcome");
    expect(shownTip(tips, { ...prefs, on: false })).toBeUndefined();
  });

  it("snoozes a dismissed tip until its situation ends, then shows it again", () => {
    const after = dismissed(prefs, "eat");
    expect(shownTip(tips, after)?.id).toBe("rest");
    expect(forgetEnded(after, ["eat", "rest"])).toBe(after); // still hungry: stays hidden
    const fed = forgetEnded(after, ["rest"]);
    expect(fed.snoozed).toEqual([]);
    expect(shownTip(tips, fed)?.id).toBe("eat"); // hungry again: back
  });

  it("mutes a tip shown only once on dismiss, and any tip on Don't show again", () => {
    expect(dismissed(prefs, "welcome").muted).toEqual(["welcome"]);
    expect(forgetEnded(muted(prefs, "eat"), []).muted).toEqual(["eat"]);
  });

  it("reads stored prefs defensively", () => {
    expect(parseTipPrefs(null)).toEqual(prefs);
    expect(parseTipPrefs("not json")).toEqual(prefs);
    expect(parseTipPrefs(JSON.stringify({ on: false, muted: ["eat", "bogus"], snoozed: 3 }))).toEqual({ on: false, muted: ["eat"], snoozed: [] });
  });
});
