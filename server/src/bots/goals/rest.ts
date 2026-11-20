import { EQUIPMENT_TYPES, type PlayerId, type PlayerView, type RoomId } from "@mush2/shared";
import { hasBotSkill } from "../duties.ts";
import { act, canAfford, failed, find, goTo, roomsWith, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef } from "./types.ts";

/**
 * Morale from which a bot leaves the beds in a Shrink's room to others (owner, 2026-11-18, #452): it rests there only
 * when no other bed is in reach.
 */
export const LEAVE_SHRINK_BEDS_MORALE = 12;

/**
 * Bedrooms this bot found with every bed taken, and who lay in them then (oxygen plan Run A2, 2026-11-19). A room stays
 * remembered as full across cycles until the bot sees it with a free bed, or sees one of those sleepers elsewhere, up
 * or dead: then a bed may have come free. `rest` doesn't offer a room remembered as full, so a bot doesn't spend the AP
 * it just gained walking from one full bedroom to the next.
 */
export type FullBeds = Map<RoomId, Set<PlayerId>>;

/** Update `full` from the bot's own view: its room's beds and who lies in them, and where it sees people. */
export function observeBeds(view: PlayerView, full: FullBeds): void {
  const room = view.you.room;
  const beds = view.roomEquipment.filter((e) => EQUIPMENT_TYPES[e.type]?.bed);
  if (beds.length > 0) {
    const taken = new Set(view.players.filter((p) => p.alive && p.room === room && p.lying !== undefined).map((p) => p.lying!));
    if (view.you.lyingIn !== undefined) taken.add(view.you.lyingIn);
    if (beds.some((b) => !taken.has(b.id))) full.delete(room);
    // Lying here itself, the bot needs no bed; its own bed comes free when it gets up.
    else if (view.you.lyingIn === undefined) full.set(room, new Set(view.players.filter((p) => p.alive && p.room === room && p.lying !== undefined).map((p) => p.id)));
  }
  for (const [r, sleepers] of full) {
    if (r === room) continue;
    const up = view.players.some((p) => sleepers.has(p.id) && (!p.alive || (p.room !== undefined && p.room !== r)));
    if (up) full.delete(r);
  }
}

/** Whether a resting bot gets up as a cycle starts: a jump or an expedition to make, or hunters to shoot (owner, 2026-11-01). */
export function leavesBed(view: PlayerView, memory: BotMemory, goals: readonly GoalDef[]): boolean {
  if (goals.some((def) => (def.id === "travel" || def.id === "expeditionPrep" || def.id === "expeditionLaunch") && def.options(view, memory).length > 0)) return true;
  return view.hunters.count > 0 && goals.some((def) => HUNTER_GOALS.has(def.id) && def.options(view, memory).length > 0);
}

/** Goals that interrupt a rest at the start of a cycle when hunters are outside (owner, 2026-11-01). */
const HUNTER_GOALS = new Set(["shootHunters", "crewShootHunters", "patrolShootHunters"]);

/**
 * Rest in the nearest bed (a bed gives AP each cycle): lie down, then wait cycle after cycle until AP is full. A new
 * cycle doesn't interrupt it, or the bot would get up after one cycle. Comes once the bot has no AP left it would spend
 * on work. Whether a bed is free is learned only on arrival; a taken one fails, and the next nearest bedroom not
 * remembered as full (`observeBeds`) is offered. With every bed in reach remembered as full, it offers nothing and the
 * bot keeps its AP.
 * May spend the AP reserve to get there. A bot at `LEAVE_SHRINK_BEDS_MORALE` or more takes a bed in a Shrink's room
 * only when no other is in reach. A Shrink never lies down (owner, 2026-11-18, #452): the beds are for the people its
 * presence cheers. When it would rest, it stands in the room with a bed where ACTOPI shows the most people instead
 * (`standIn`), so those resting there gain morale; it gives up the bed's AP for that.
 */
export const rest: GoalDef = {
  id: "rest",
  priority: 40,
  options(view, memory) {
    if (view.you.ap >= view.maxAp) return [];
    // Antisocial (#470): a bed's room is almost never empty, so she never lies down; `isolate` takes her somewhere quiet.
    if (view.statuses.includes("antisocial")) return [];
    if (hasBotSkill(view, "shrink")) return shrinkRest(view, memory);
    if (view.you.lyingIn !== undefined) return [restIn(view.you.room, "Stay in bed until your AP is full")];
    const open = roomsWith(view, ["BED"]).filter((r) => !memory.ended.has(`rest:${r}`) && !memory.fullBeds.has(r) && canAfford(view, r, view.config.lieDownAp, 0, memory));
    const shrinkHere = (r: string) => view.players.some((p) => p.alive && p.room === r && memory.shrinks.has(p.id));
    const room = view.you.morale >= LEAVE_SHRINK_BEDS_MORALE ? (open.find((r) => !shrinkHere(r)) ?? open[0]) : open[0];
    return room ? [restIn(room, `Rest: lie down in a bed ${where(view, room)} until your AP is full`)] : [];
  },
};

/** The Shrink's rest: stand in the room with a bed holding the most people (nearest first on a tie) until its AP is full. */
function shrinkRest(view: PlayerView, memory: BotMemory): Goal[] {
  const people = (r: string) => view.players.filter((p) => p.alive && p.room === r).length;
  const open = roomsWith(view, ["BED"]).filter((r) => !memory.ended.has(`rest:${r}`) && canAfford(view, r, 0, 0, memory));
  const room = [...open].sort((a, b) => people(b) - people(a))[0];
  if (!room) return [];
  return [
    {
      id: "rest",
      key: `rest:${room}`,
      label: `Wait ${where(view, room)}, where people rest, until your AP is full: resting near you cheers them`, // i18n-ignore: model prompt text, not player-visible
      step(v) {
        if (v.you.ap >= v.maxAp) return { kind: "done", again: true };
        return goTo(v, room) ?? { kind: "wait" };
      },
      keepAcrossCycle(v, m, _newDay, goals) {
        return v.you.room === room && !leavesBed(v, m, goals);
      },
    },
  ];
}

function restIn(room: string, label: string): Goal {
  return {
    id: "rest",
    key: `rest:${room}`,
    label,
    step(view) {
      // Rested: it may rest here again later this cycle.
      if (view.you.ap >= view.maxAp) return { kind: "done", again: true };
      if (view.you.lyingIn !== undefined) return { kind: "wait" };
      const walk = goTo(view, room);
      if (walk) return walk;
      const bed = find(view, "lie_down");
      return bed ? act(bed) : failed("bed_taken");
    },
    keepAcrossCycle(view, memory, _newDay, goals) {
      return !leavesBed(view, memory, goals);
    },
  };
}
