import { describe, expect, it } from "vitest";
import { createChannel, sendChat } from "../src/chat.ts";
import { logPrivate, logSecret } from "../src/log.ts";
import { acknowledgeTransfer, bodyOf } from "../src/mind.ts";
import { ITRACKIE_ITEM } from "../src/items.ts";
import { dropMycoAlarms } from "../src/mycoalarm.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { clone, must, offered, player, testConfig } from "./support.ts";
import { makeSeats } from "./support.ts";

const base = testConfig();
const transfer = (target: string): Action => ({ type: "body_transfer", target });

/**
 * p0 (Mush, with Transfer) in the laboratory with p1 (contaminated 1) and p2 (clean); p3 (contaminated) in the
 * refectory.
 */
function ship(config = base): GameState {
  const s = createGame(makeSeats(4), config, 5, { p0: "mush" });
  for (const id of ["p0", "p1", "p2"]) player(s, id).room = "LABORATORY";
  player(s, "p3").room = "REFECTORY";
  player(s, "p0").mushSkills.push("transfert");
  s.contamination.p1 = 1;
  s.contamination.p3 = 2;
  return s;
}

const swapped = (s = ship()) => must(applyAction(s, "p0", transfer("p1")));

describe("Transfer (Mush skill)", () => {
  it("is offered only to a Mush with the skill, on contaminated living humans in the room", () => {
    const s = ship();
    expect(offered(s, "p0").filter((a) => a.type === "body_transfer")).toEqual([transfer("p1")]);
    expect(applyAction(s, "p0", transfer("p2")).ok).toBe(false); // contamination 0
    expect(applyAction(s, "p0", transfer("p3")).ok).toBe(false); // elsewhere
    const noSkill = clone(s);
    player(noSkill, "p0").mushSkills = [];
    expect(offered(noSkill, "p0").some((a) => a.type === "body_transfer")).toBe(false);
    expect(applyAction(noSkill, "p0", transfer("p1")).ok).toBe(false);
    const dead = clone(s);
    player(dead, "p1").alive = false;
    expect(applyAction(dead, "p0", transfer("p1")).ok).toBe(false);
  });

  it("ignores Antique Perfume immunity", () => {
    const s = ship();
    player(s, "p1").immuneUntil = s.cycle + 10;
    expect(applyAction(s, "p0", transfer("p1")).ok).toBe(true);
  });

  it("moves the mind and everything Mush; the body keeps the rest", () => {
    const s = ship();
    const [mush, human] = [player(s, "p0"), player(s, "p1")];
    mush.spores = 2;
    mush.name = "Mush player";
    human.name = "Human player";
    s.items.push({ id: "wrench-1", type: "wrench", at: { kind: "player", id: "p1" } });
    human.ap = 7;
    human.hp = 9;
    human.satiety = 3;
    human.skills = ["medic"];
    const r = swapped(s);
    const [oldBody, newBody] = [player(r, "p0"), player(r, "p1")];
    // The minds swapped: seats resolve to the other body.
    expect([bodyOf(r, "p0"), bodyOf(r, "p1")]).toEqual(["p1", "p0"]);
    expect([newBody.name, oldBody.name]).toEqual(["Mush player", "Human player"]);
    // Mush things moved with the mind.
    expect([newBody.role, newBody.alpha, newBody.spores, newBody.mushSkills]).toEqual(["mush", true, 2, ["transfert"]]);
    expect([oldBody.role, oldBody.alpha, oldBody.spores, oldBody.mushSkills]).toEqual(["human", false, 0, []]);
    expect(r.contamination.p0 ?? 0).toBe(0);
    expect(r.contamination.p1).toBeUndefined();
    // The body kept its own.
    expect([newBody.ap, newBody.hp, newBody.satiety, newBody.skills, newBody.satietyZeroSince]).toEqual([7, 9, 3, ["medic"], null]);
    expect(r.items.find((i) => i.id === "wrench-1")?.at).toEqual({ kind: "player", id: "p1" });
    // The old Mush body is now a human at satiety 0, counting toward hunger from now.
    expect([oldBody.satiety, oldBody.satietyZeroSince]).toEqual([0, r.cycle]);
  });

  it("can be used once per game, by the mind that used it", () => {
    const r = swapped();
    expect(offered(r, "p1").some((a) => a.type === "body_transfer")).toBe(false);
    r.contamination.p2 = 1;
    expect(applyAction(r, "p1", transfer("p2")).ok).toBe(false);
  });

  it("keeps titles and private channels with the body", () => {
    let s = ship();
    s.titles.commander = "p1";
    s = must(createChannel(s, "p1", "Plans"));
    const r = swapped(s);
    expect(r.titles.commander).toBe("p1");
    expect(viewFor(r, "p1").privateChannels.map((c) => c.name)).toEqual(["Plans"]);
    expect(viewFor(r, "p0").privateChannels).toEqual([]);
  });

  it("private channels keep their whole history with the body (owner, 2026-10-24)", () => {
    const start = ship();
    // Posting needs an iTrackie; it stays with the body, so it is the reader's after the swap too.
    start.items.push({ id: "itrackie-1", type: ITRACKIE_ITEM, at: { kind: "player", id: "p1" } });
    let s = must(createChannel(start, "p1", "Plans"));
    const channel = s.channels[0]!.id;
    s = must(sendChat(s, "p1", channel, "before"));
    const r = swapped(s);
    expect(viewFor(r, "p1").chat.some((m) => m.text === "before")).toBe(true);
    expect(viewFor(r, "p0").chat.some((m) => m.text === "before")).toBe(false);
  });

  it("cancels both players' actions and clears ready", () => {
    const s = ship();
    for (const id of ["p0", "p1"]) {
      const p = player(s, id);
      p.current = { action: { type: "extract_spore" }, since: 0, until: 10, adjustment: { ap: 0, mp: 0 } };
      p.queue = [{ action: { type: "extract_spore" }, adjustment: { ap: 0, mp: 0 } }];
    }
    // A ready player can't act, so only the victim is.
    player(s, "p1").ready = true;
    const r = swapped(s);
    for (const id of ["p0", "p1"]) expect([player(r, id).current, player(r, id).queue, player(r, id).ready]).toEqual([null, [], false]);
  });

  it("private log lines stay with the body (owner, 2026-11-05, #281)", () => {
    const s = ship();
    logPrivate(s, "p0", "chosenMush");
    logPrivate(s, "p1", "converted");
    const r = swapped(s);
    // The Mush player, now in body p1, reads the victim's old line and the transfer line; not their own old one.
    const mushLog = viewFor(r, "p1").log.map((e) => e.key);
    expect(mushLog).toContain("converted");
    expect(mushLog).toContain("bodyTransferred");
    expect(mushLog).not.toContain("chosenMush");
    // The victim, now in the Mush's old body, reads that body's past.
    const victimLog = viewFor(r, "p0").log.map((e) => e.key);
    expect(victimLog).toContain("chosenMush");
    expect(victimLog).not.toContain("converted");
    expect(victimLog).not.toContain("bodyTransferred");
  });

  it("never rewrites the log, and later lines are addressed to the body", () => {
    const s = ship();
    logPrivate(s, "p0", "chosenMush");
    const before = structuredClone(s.log);
    const r = swapped(s);
    expect(r.log.slice(0, before.length)).toEqual(before);
    logSecret(r, "p1", "hid", undefined, "p0");
    expect(r.log.at(-1)!.visibleTo).toEqual(["p1", "p2"]);
    expect(viewFor(r, "p1").log.map((e) => e.key)).toContain("hid");
    expect(viewFor(r, "p0").log.map((e) => e.key)).not.toContain("hid");
    // A view names only its viewer: a witness never learns who else saw a line.
    expect(viewFor(r, "p2").log.find((e) => e.key === "hid")!.visibleTo).toEqual(["p2"]);
  });

  it("a witness's view of a line from before the Transfer doesn't change (it would show who moved)", () => {
    const s = ship();
    logSecret(s, "p0", "hid", undefined, "p1");
    const before = viewFor(s, "p2").log;
    const r = swapped(s);
    const after = viewFor(r, "p2").log;
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it("leaves no sign for bystanders, and only the victim sees the pop-up", () => {
    const s = ship();
    const before = viewFor(s, "p2");
    const r = swapped(s);
    const after = viewFor(r, "p2");
    // A witness in the room, and someone elsewhere, see exactly the same view (their own actions aside).
    const { actions: _a, ...afterRest } = after;
    const { actions: _b, ...beforeRest } = before;
    expect(afterRest).toEqual(beforeRest);
    const { actions: _c, ...farAfter } = viewFor(r, "p3");
    const { actions: _d, ...farBefore } = viewFor(s, "p3");
    expect(farAfter).toEqual(farBefore);
    expect(viewFor(r, "p0").you.bodyTakenBy).toBe(player(s, "p0").character);
    for (const id of ["p1", "p2", "p3"]) expect(JSON.stringify(viewFor(r, id))).not.toContain("bodyTakenBy");
    for (const id of ["p0", "p1", "p2", "p3"]) {
      const json = JSON.stringify(viewFor(r, id));
      expect(json).not.toContain('"mind"');
      expect(json).not.toContain("transferUsed");
    }
  });

  it("rings myco-alarms in the room", () => {
    const s = ship();
    dropMycoAlarms(s, "LABORATORY");
    const r = swapped(s);
    expect(viewFor(r, "p2").log.some((e) => e.key === "mycoAlarmRang")).toBe(true);
  });

  it("the victim acknowledges the pop-up; nobody else can", () => {
    const r = swapped();
    expect(acknowledgeTransfer(r, "p1").ok).toBe(false);
    const done = must(applyInput(r, { type: "acknowledgeTransfer", by: "p0" }));
    expect(player(done, "p0").bodyTakenBy).toBeUndefined();
    expect(parseGameMessage(JSON.stringify({ type: "acknowledgeTransfer" }))).toEqual({ type: "acknowledgeTransfer" });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: transfer("p1") }))).toEqual({ type: "action", action: transfer("p1") });
  });

  it("an illegal transfer leaves the state unchanged", () => {
    const s = ship();
    const copy = clone(s);
    expect(applyAction(s, "p0", transfer("p2")).ok).toBe(false);
    expect(s).toEqual(copy);
  });
});
