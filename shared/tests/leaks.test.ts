// Hidden information, bluntly (issues #101 and #102): give every hidden value in a game a unique sentinel, serialize each
// seat's view, and check that each sentinel shows up only in the views allowed to have it. This catches a leak
// through any view field, including ones nobody thought to check. Which state fields exist, and who may see
// each, is in leakFields.ts; a new field fails here until it is listed there.

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { type GameState, MUSH_CHANNEL, type PlayerId } from "../src/types.ts";
import { GAME_STATE_FIELDS, ITEM_STATE_FIELDS, PLAYER_STATE_FIELDS } from "./leakFields.ts";
import { makeSeats, player } from "./support.ts";

const HERE = "LABORATORY";
const ELSEWHERE = "REFECTORY";
const SEATS = ["p0", "p1", "p2", "p3"];

interface Sentinel {
  what: string;
  value: string | number;
  /** The seats whose views may contain it. */
  seenBy: PlayerId[];
}

/**
 * p0 (Mush), p1 and p2 (humans) in the laboratory, p3 (human) in the refectory. Every hidden value is a sentinel:
 * a number or string that appears nowhere else in the game.
 */
function ship(): { state: GameState; sentinels: Sentinel[] } {
  const s = createGame(makeSeats(4), { ...DEFAULT_CONFIG, mushCount: 1, startItems: [], startSkills: [] }, 1, { p0: "mush" });
  const sentinels: Sentinel[] = [];
  let next = 734_101;
  const num = (what: string, seenBy: PlayerId[]): number => {
    const value = (next += 7);
    sentinels.push({ what, value, seenBy });
    return value;
  };
  const str = (what: string, seenBy: PlayerId[]): string => {
    const value = `sentinel-${what}`;
    sentinels.push({ what, value, seenBy });
    return value;
  };

  for (const p of s.players) {
    const own = [p.id];
    p.room = p.id === "p3" ? ELSEWHERE : HERE;
    p.name = str(`name-${p.id}`, []);
    p.mind = str(`mind-${p.id}`, []);
    p.transferUsed = true;
    p.bodyTakenBy = str(`bodyTakenBy-${p.id}`, own) as typeof p.character;
    p.ap = num(`ap-${p.id}`, own);
    p.mp = num(`mp-${p.id}`, own);
    p.hp = num(`hp-${p.id}`, own);
    p.morale = num(`morale-${p.id}`, own);
    p.satiety = num(`satiety-${p.id}`, own);
    p.satietyZeroSince = num(`satietyZeroSince-${p.id}`, own);
    p.immuneUntil = num(`immuneUntil-${p.id}`, own);
    p.spores = num(`spores-${p.id}`, own);
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = num(`resources.${r}-${p.id}`, own);
    p.modifiers.push(str(`modifier-${p.id}`, own));
    // Unknown status ids count as private; skills and beds show to the living in the same room.
    p.statuses.push(str(`status-${p.id}`, own));
    const room = p.room === HERE ? ["p0", "p1", "p2"] : ["p3"];
    p.skills.push(str(`skill-${p.id}`, room));
    p.bookSkill = str(`bookSkill-${p.id}`, room);
    p.mushSkills.push(str(`mushSkill-${p.id}`, own));
    p.lyingIn = str(`lyingIn-${p.id}`, room);
    p.spot = { door: str(`spot-${p.id}`, room) };
    p.pushedBy = str(`pushedBy-${p.id}`, room);
    p.accommodationOffers = [{ by: str(`accommodationOffers-${p.id}`, own), until: num(`accommodationOfferUntil-${p.id}`, own) }];
    p.current = {
      action: { type: "take", item: str(`current-${p.id}`, own) },
      since: 1,
      until: 2,
      adjustment: { ap: 0, mp: 0 },
    };
    p.queue = [{ action: { type: "take", item: str(`queue-${p.id}`, own) }, adjustment: { ap: 0, mp: 0 } }];
    s.items.push({ id: str(`inventory-${p.id}`, own), type: "wrench", at: { kind: "player", id: p.id } });
    s.scanFailures[p.id] = num(`scanFailures-${p.id}`, []);
    s.turretFailures[p.id] = num(`turretFailures-${p.id}`, []);
    s.sharedOnDay[p.id] = num(`sharedOnDay-${p.id}`, []);
    s.planets[p.id] = [
      {
        id: str(`planet-${p.id}`, own),
        name: str(`planetName-${p.id}`, own),
        direction: "north",
        distance: num(`planetDistance-${p.id}`, own),
        sectors: [
          { tag: "FOREST", known: true },
          // biome-ignore lint/suspicious/noExplicitAny: a tag no real planet has, so it can be searched for
          { tag: str(`unknownTag-${p.id}`, []) as any, known: false },
        ],
      },
    ];
    s.log.push({ cycle: s.cycle, key: "test", params: { x: str(`privateLog-${p.id}`, own) }, room: p.room, visibleTo: [p.id] });
  }

  // Contamination is hidden from its owner; only a living Mush in their room sees it (p1 here, not p3 elsewhere).
  s.contamination.p1 = num("contamination-p1", ["p0"]);
  s.contamination.p3 = num("contamination-p3", []);
  s.rng = num("rng", []);
  s.sporesToday = num("sporesToday", []);
  s.sporeExtractedOn.p0 = num("sporeExtractedOn-p0", []);
  s.dispensedOn.anything = num("dispensedOn", []);
  s.nextItemId = num("nextItemId", []);
  s.nextChatId = num("nextChatId", []);
  s.nextThreadId = num("nextThreadId", []);
  s.nextPlanetId = num("nextPlanetId", []);
  s.now = num("now", []);
  // Nobody is in a turret room, so no one sees a hunter's hp or id, or a turret's charges; only the count is public.
  s.hunters = { points: num("hunterPoints", []), since: num("huntersSince", []), nextId: num("hunterNextId", []), list: [{ id: str("hunterId", []), hp: num("hunterHp", []), hitChance: num("hunterHitChance", []), targeted: true }] };
  s.turrets["LASER_TURRET_A_0:TURRET_COMMAND"] = num("turretCharges", []);

  s.items.push({ id: str("floor-here", ["p0", "p1", "p2"]), type: "wrench", at: { kind: "room", id: HERE } });
  s.items.push({ id: str("floor-elsewhere", ["p3"]), type: "wrench", at: { kind: "room", id: ELSEWHERE } });
  s.log.push({ cycle: s.cycle, key: "test", params: { x: str("roomLog-elsewhere", ["p3"]) }, room: ELSEWHERE, visibleTo: "all" });
  s.chat.push({ id: 1, cycle: s.cycle, channel: MUSH_CHANNEL, from: "p0", isBot: false, text: str("mushChat", ["p0"]) });
  s.bonds.p1 = ["p2"];
  s.channels.push({ id: "pc-1", name: str("channelName", ["p1", "p3"]), members: ["p1", "p3"], createdBy: "p1" });
  s.chat.push({ id: 2, cycle: s.cycle, channel: "pc-1", from: "p1", isBot: false, text: str("privateChat", ["p1", "p3"]) });
  return { state: s, sentinels };
}

/** Whether `value` appears in `json` as a whole token (so 734108 doesn't match inside 1734108). */
function contains(json: string, value: string | number): boolean {
  if (typeof value === "string") return json.includes(value);
  return new RegExp(`(?<![\\w.])${value}(?![\\w.])`).test(json);
}

describe("hidden information in views", () => {
  const { state, sentinels } = ship();
  const views = Object.fromEntries(SEATS.map((id) => [id, JSON.stringify(viewFor(state, id))]));

  it.each(SEATS)("%s's view has no sentinel it may not see", (id) => {
    const leaked = sentinels.filter((s) => !s.seenBy.includes(id) && contains(views[id]!, s.value)).map((s) => s.what);
    expect(leaked).toEqual([]);
  });

  it.each(SEATS)("%s's view has every sentinel it may see (so the check above isn't vacuous)", (id) => {
    const missing = sentinels.filter((s) => s.seenBy.includes(id) && !contains(views[id]!, s.value)).map((s) => s.what);
    expect(missing).toEqual([]);
  });

  it("a bond is in its two partners' views only", () => {
    const bonds = (id: PlayerId) => viewFor(state, id).bonds;
    expect(bonds("p1")).toEqual({ to: ["p2"], from: [] });
    expect(bonds("p2")).toEqual({ to: [], from: ["p1"] });
    for (const id of ["p0", "p3"]) expect(bonds(id)).toEqual({ to: [], from: [] });
  });

  it("no human's view mentions the Mush role, and the Mush's does", () => {
    for (const id of ["p1", "p2", "p3"]) expect(views[id]).not.toMatch(/"mush"|"alpha":true/);
    expect(player(state, "p0").role).toBe("mush");
    expect(views.p0).toMatch(/"role":"mush"/);
  });
});

describe("leakFields.ts lists every state field", () => {
  const { state } = ship();
  const keys = (objects: object[]) => [...new Set(objects.flatMap((o) => Object.keys(o)))].sort();
  const missing = (objects: object[], listed: object) => keys(objects).filter((k) => !(k in listed));

  it("GameState", () => expect(missing([state], GAME_STATE_FIELDS)).toEqual([]));
  it("PlayerState", () => expect(missing(state.players, PLAYER_STATE_FIELDS)).toEqual([]));
  it("ItemState", () => expect(missing(state.items, ITEM_STATE_FIELDS)).toEqual([]));
});
