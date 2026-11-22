import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { installCameraIn } from "./cameras.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, must, nextCycle, noCharacterModifiers, offered, option, player, testConfig } from "./support.ts";

const seats = makeSeats(5);
// No character traits: seat p1 is Chun, who is immune.
const config = noCharacterModifiers(testConfig({ maxAp: 99, startAp: 50 }));
const spike = (target: PlayerId): Action => ({ type: "spike", target });

/** p0 Mush with 2 spores; p1 human with p0 in SICK_BAY; p2 Mush and p3 human in the refectory; p4 human alone in the lab. */
function ship(witness = false): GameState {
  const s = createGame(seats, config, 3);
  const get = (id: PlayerId) => s.players.find((p) => p.id === id)!;
  s.players.forEach((p) => {
    p.role = p.id === "p0" || p.id === "p2" ? "mush" : "human";
  });
  get("p0").room = get("p1").room = "SICK_BAY";
  get("p0").spores = 2;
  get("p2").room = get("p3").room = "REFECTORY";
  get("p4").room = witness ? "SICK_BAY" : "LABORATORY";
  return s;
}

describe("spiking", () => {
  it("costs 1 AP and 1 spore and raises the human's contamination by 1", () => {
    const r = applyAction(ship(), "p0", spike("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").spores).toBe(1);
    expect(player(r.state, "p0").ap).toBe(config.startAp - 1);
    expect(r.state.contamination.p1).toBe(1);
  });

  it("converts the human on the third spike, after which they can't be spiked", () => {
    let s = ship();
    s.players.find((p) => p.id === "p0")!.spores = 5;
    for (let i = 0; i < 3; i++) {
      const r = applyAction(s, "p0", spike("p1"));
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      s.spikedOn = {};
    }
    expect(player(s, "p1").role).toBe("mush");
    expect(s.contamination).toEqual({});
    expect(applyAction(s, "p0", spike("p1")).ok).toBe(false);
  });

  it("has a 4-cycle cooldown per Mush, shown as disabled with the cycles left", () => {
    let s = ship();
    player(s, "p0").spores = 5;
    s = must(applyAction(s, "p0", spike("p1")));
    const listed = () => viewFor(s, "p0").actions.find((o) => o.action.type === "spike" && o.action.target === "p1");
    expect(applyAction(s, "p0", spike("p1"))).toMatchObject({ ok: false });
    expect(listed()).toMatchObject({ lacks: ["cooldown"], cooldown: 4 });
    s = nextCycle(nextCycle(s));
    expect(listed()).toMatchObject({ lacks: ["cooldown"], cooldown: 2 });
    s = nextCycle(nextCycle(s));
    expect(listed()?.lacks).toEqual([]);
    expect(applyAction(s, "p0", spike("p1")).ok).toBe(true);
  });

  it("has no cooldown with the infiniteSpores cheat", () => {
    let s = ship();
    player(s, "p0").spores = 5;
    player(s, "p0").cheats = ["infiniteSpores"];
    s = must(applyAction(s, "p0", spike("p1")));
    expect(applyAction(s, "p0", spike("p1")).ok).toBe(true);
  });

  it("keeps the cooldown separate per Mush", () => {
    const s = ship();
    player(s, "p2").spores = 1;
    const t = must(applyAction(s, "p0", spike("p1")));
    expect(applyAction(t, "p2", spike("p3")).ok).toBe(true);
  });

  it("is offered only to Mush with a spore, for humans in their room", () => {
    const s = ship();
    expect(offered(s, "p0")).toContainEqual(spike("p1"));
    expect(offered(s, "p0")).not.toContainEqual(spike("p3"));
    expect(offered(s, "p1").some((a) => a.type === "spike")).toBe(false);
    player(s, "p0").spores = 0;
    expect(offered(s, "p0").some((a) => a.type === "spike")).toBe(false);
  });

  it("leaves state unchanged when illegal", () => {
    const s = ship();
    player(s, "p0").room = "LABORATORY"; // p1 not here
    const cases: Array<[PlayerId, Action]> = [
      ["p1", spike("p0")], // human actor
      ["p0", spike("p1")], // not in the room
      ["p2", spike("p0")], // target is Mush (and not in room)
      ["p0", spike("nobody")],
    ];
    for (const [id, a] of cases) expect(applyAction(s, id, a).ok).toBe(false);
    const s2 = ship();
    s2.players.find((p) => p.id === "p2")!.room = "SICK_BAY";
    s2.players.find((p) => p.id === "p2")!.spores = 1;
    expect(applyAction(s2, "p2", spike("p0")).ok).toBe(false); // Mush target
    player(s2, "p0").spores = 0;
    expect(applyAction(s2, "p0", spike("p1")).ok).toBe(false); // no spores
    expect(s2.contamination).toEqual({});
  });

  it("is refused for a dead target or without AP", () => {
    const dead = ship();
    player(dead, "p1").alive = false;
    expect(applyAction(dead, "p0", spike("p1")).ok).toBe(false);
    const broke = ship();
    player(broke, "p0").ap = 0;
    expect(applyAction(broke, "p0", spike("p1")).ok).toBe(false);
  });

  it("hides contamination from humans and Mush elsewhere, and the victim is not told", () => {
    const r = applyAction(ship(), "p0", spike("p1"));
    if (!r.ok) throw new Error(r.error);
    for (const id of ["p1", "p2", "p3", "p4"]) {
      expect(JSON.stringify(viewFor(r.state, id))).not.toContain("contamination");
    }
    // The Mush beside the victim sees it, as the victim's level.
    expect(viewFor(r.state, "p0").players.find((p) => p.id === "p1")!.contamination).toBe(1);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "spiked")).toBe(false); // no bystander: private to the actor
    expect(viewFor(r.state, "p0").log.some((e) => e.key === "spiked")).toBe(true);
  });

  it("is covert: a bystander doesn't see it", () => {
    const r = applyAction(ship(true), "p0", spike("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.log.find((e) => e.key === "spiked")!.visibleTo).toEqual(["p0"]);
    expect(r.state.log.find((e) => e.key === "spiked")!.level).toBeUndefined(); // not spilled, so no warning
    for (const id of ["p1", "p3", "p4"]) expect(viewFor(r.state, id).log.some((e) => e.key === "spiked")).toBe(false);
  });

  it("is room history, victim included, when a camera is in the room, and never reaches other rooms", () => {
    const s = ship(true);
    installCameraIn(s, "SICK_BAY");
    const r = applyAction(s, "p0", spike("p1"));
    if (!r.ok) throw new Error(r.error);
    for (const id of ["p1", "p4"]) expect(viewFor(r.state, id).log.some((e) => e.key === "spiked")).toBe(true);
    expect(r.state.log.find((e) => e.key === "spiked")!.level).toBe("warning");
    expect(viewFor(r.state, "p3").log.some((e) => e.key === "spiked")).toBe(false);
  });

  it("is not revealed by a camera someone carries, one lying uninstalled in the room, or one installed in another room", () => {
    const s = ship(true);
    s.items.push({ id: "cam1", type: "camera", at: { kind: "player", id: "p4" } }, { id: "cam2", type: "camera", at: { kind: "room", id: "SICK_BAY" } });
    installCameraIn(s, "REFECTORY");
    const r = applyAction(s, "p0", spike("p1"));
    if (!r.ok) throw new Error(r.error);
    for (const id of ["p1", "p3", "p4"]) expect(viewFor(r.state, id).log.some((e) => e.key === "spiked")).toBe(false);
  });

  it("parses from the client", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "spike", target: "p1" } }))).toEqual({
      type: "action",
      action: spike("p1"),
    });
  });
});

describe("spore tags", () => {
  it("tags spiking as a spore action, but not extracting a spore (owner, 2026-10-18)", () => {
    expect(ACTIONS.spike.tags).toEqual(["spore", "aggressive", "mush"]);
    expect(ACTIONS.extract_spore.tags).toEqual([]);
    expect(option(ship(), "p0", { type: "spike" })?.tags).toEqual(["spore", "aggressive", "mush"]);
  });

  it("never reaches a human's view, even with a Mush in the room", () => {
    for (const id of ["p1", "p3"]) expect(viewFor(ship(), id).actions.some((o) => o.tags.includes("spore"))).toBe(false);
  });
});
