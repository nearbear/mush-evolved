import { describe, expect, it } from "vitest";
import { isCheatMessage, isSocialMessage, type SharedPlantRow } from "@mush2/shared";
import { moderateSocial } from "../src/socialModeration.ts";

const row = (effects: string): SharedPlantRow => ({ species: "fruit_banana", effects, thirst: 0, sickCycles: null, young: false });

describe("moderateSocial", () => {
  it("passes chat through, keeping the raw text only when moderation changed it", () => {
    expect(moderateSocial({ type: "chat", channel: "global", text: "hello" }, "p1")).toEqual({
      ok: true,
      input: { type: "chat", channel: "global", text: "hello", by: "p1" },
      raw: undefined,
    });
    const changed = moderateSocial({ type: "chat", channel: "global", text: "oh  zorblaxt" }, "p1");
    expect(changed).toEqual({ ok: true, input: { type: "chat", channel: "global", text: "oh ********", by: "p1" }, raw: "oh  zorblaxt" });
  });

  it("blocks empty chat with moderation's reason, and a share with share_text_invalid", () => {
    expect(moderateSocial({ type: "chat", channel: "global", text: "   " }, "p1")).toEqual({
      ok: false,
      error: "empty_message",
      blocked: { type: "chat", raw: "   ", reason: "empty_message" },
    });
    const share = moderateSocial({ type: "sharePlanet", planet: "x", sectors: [], text: "" }, "p1");
    expect(share).toMatchObject({ ok: false, error: "share_text_invalid", blocked: { type: "sharePlanet", reason: "empty_message" } });
  });

  it("lets a private channel go unnamed but moderates a thread's name", () => {
    expect(moderateSocial({ type: "createChannel", members: ["p2"] }, "p1")).toEqual({
      ok: true,
      input: { type: "createChannel", members: ["p2"], by: "p1", name: "" },
    });
    expect(moderateSocial({ type: "createThread", name: "" }, "p1")).toMatchObject({ ok: false, blocked: { type: "createThread" } });
  });

  it("moderates every plant row and blocks on the first bad one", () => {
    const ok = moderateSocial({ type: "sharePlants", plants: [row(""), row("heals  zorblaxt")], text: "" }, "p1");
    expect(ok).toEqual({
      ok: true,
      input: { type: "sharePlants", by: "p1", plants: [row(""), row("heals ********")], text: "" },
      raw: "heals  zorblaxt",
    });
    const long = "x".repeat(10_000);
    expect(moderateSocial({ type: "sharePlants", plants: [row(long)], text: "" }, "p1")).toMatchObject({
      ok: false,
      error: "share_text_invalid",
      blocked: { type: "sharePlants", raw: long, reason: "message_too_long" },
    });
  });

  it("clears an empty item name and refuses a bad one", () => {
    expect(moderateSocial({ type: "renameItem", item: 7, name: " " }, "p1")).toEqual({ ok: true, input: { type: "renameItem", by: "p1", item: 7, name: "" } });
    expect(moderateSocial({ type: "renameItem", item: 7, name: "a".repeat(500) }, "p1")).toMatchObject({ ok: false, error: "item_name_invalid" });
  });

  it("passes a PILGRED share without text, and messages with no free text, straight through", () => {
    expect(moderateSocial({ type: "sharePilgred", percent: 40, text: "" }, "p1")).toEqual({ ok: true, input: { type: "sharePilgred", by: "p1", percent: 40, text: "" } });
    expect(moderateSocial({ type: "leaveChannel", channel: "private:1" as never }, "p1")).toEqual({ ok: true, input: { type: "leaveChannel", channel: "private:1", by: "p1" } });
  });
});

describe("message groups", () => {
  it("tells social messages and cheats apart", () => {
    expect(isSocialMessage({ type: "chat", channel: "global", text: "hi" })).toBe(true);
    expect(isSocialMessage({ type: "walk", x: 0, y: 0, sitting: false })).toBe(false);
    expect(isCheatMessage({ type: "leaveShip" })).toBe(true);
    expect(isCheatMessage({ type: "action", action: { type: "warp_to_planet" } as never })).toBe(true);
    expect(isCheatMessage({ type: "clearQueue" })).toBe(false);
  });
});
