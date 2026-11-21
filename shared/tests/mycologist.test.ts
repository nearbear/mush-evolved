import { describe, expect, it } from "vitest";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { MUSH_CHANNEL, type Action, type GameState, type PlayerId } from "../src/types.ts";
import { makeSeats, mustApply, player, withoutDrugs, testConfig } from "./support.ts";

const seats = makeSeats(3);
const config = testConfig();
const heal = (target: PlayerId): Action => ({ type: "heal", target });
const bandage = (target: PlayerId): Action => ({ type: "use_bandage", target });
const { mycologistSpores } = config.heal.effect;

/** Three people in the sick bay: p0 and p1 human, p2 Mush; p0 has Mycologist. */
function ship(): GameState {
  const s = withoutDrugs(createGame(seats, config, 3));
  s.players.forEach((p) => {
    p.room = "SICK_BAY";
  });
  player(s, "p0").role = "human";
  player(s, "p0").skills.push("mycologist");
  player(s, "p1").role = "human";
  player(s, "p2").role = "mush";
  player(s, "p2").spores = 2;
  return s;
}

describe("mycologist", () => {
  it("uses the confirmed spore removal count", () => {
    expect(mycologistSpores).toBe(1);
  });

  it("removes contamination when healing another human in the sick bay or with a medikit, even at full HP", () => {
    const s = ship();
    s.contamination.p1 = 2;
    const afterFirst = mustApply(s, "p0", heal("p1"));
    expect(afterFirst.contamination.p1).toBe(2 - mycologistSpores);

    // Works with a medikit outside the sick bay too.
    player(afterFirst, "p0").room = "LABORATORY";
    player(afterFirst, "p1").room = "LABORATORY";
    afterFirst.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
    const afterSecond = mustApply(afterFirst, "p0", heal("p1"));
    expect(afterSecond.contamination.p1).toBeUndefined();
  });

  it("removes contamination on self-heal and when using a bandage", () => {
    const s = ship();
    s.contamination.p0 = 1;
    const afterSelfHeal = mustApply(s, "p0", heal("p0"));
    expect(afterSelfHeal.contamination.p0).toBeUndefined();

    s.contamination.p1 = 2;
    s.items.push({ id: "b1", type: "bandage", at: { kind: "player", id: "p0" } });
    const afterBandage = mustApply(s, "p0", bandage("p1"));
    expect(afterBandage.contamination.p1).toBe(2 - mycologistSpores);

    s.contamination.p0 = 1;
    s.items.push({ id: "b2", type: "bandage", at: { kind: "player", id: "p0" } });
    const afterSelfBandage = mustApply(s, "p0", bandage("p0"));
    expect(afterSelfBandage.contamination.p0).toBeUndefined();
  });

  it("works when learned from a skill book", () => {
    const s = ship();
    player(s, "p0").skills = [];
    player(s, "p0").bookSkill = "mycologist";
    s.contamination.p1 = 1;
    const after = mustApply(s, "p0", heal("p1"));
    expect(after.contamination.p1).toBeUndefined();
  });

  it("does nothing if the Mycologist is Mush", () => {
    const s = ship();
    player(s, "p0").role = "mush";
    s.contamination.p1 = 2;
    s.items.push({ id: "b1", type: "bandage", at: { kind: "player", id: "p0" } });
    const afterHeal = mustApply(s, "p0", heal("p1"));
    expect(afterHeal.contamination.p1).toBe(2);
    const afterBandage = mustApply(s, "p0", bandage("p1"));
    expect(afterBandage.contamination.p1).toBe(2);
  });

  it("does not affect a Mush target's spores or leave negative contamination on an uncontaminated human", () => {
    const s = ship();
    const afterMush = mustApply(s, "p0", heal("p2"));
    expect(player(afterMush, "p2").role).toBe("mush");
    expect(player(afterMush, "p2").spores).toBe(2);

    const afterClean = applyAction(s, "p0", heal("p1"));
    if (!afterClean.ok) throw new Error(afterClean.error);
    expect(afterClean.state.contamination.p1).toBeUndefined();
  });

  it("removes contamination silently without extra logs, Mush-channel messages, or view leaks", () => {
    const s = ship();
    s.contamination.p1 = 2;
    const mushMsgsBefore = s.chat[MUSH_CHANNEL]?.length ?? 0;
    const logBefore = s.log.length;

    const after = mustApply(s, "p0", heal("p1"));
    expect(after.chat[MUSH_CHANNEL]?.length ?? 0).toBe(mushMsgsBefore);
    const addedLogs = after.log.slice(logBefore);
    expect(addedLogs).toHaveLength(1);
    expect(addedLogs[0]?.key).toBe("healed");
    expect(addedLogs[0]?.visibility).toBeUndefined();

    // Neither the Mycologist nor the patient learns contamination from their view.
    for (const viewerId of ["p0", "p1"] as const) {
      const v = viewFor(after, viewerId);
      expect(v.players.every((p) => p.contamination === undefined)).toBe(true);
    }
  });
});
