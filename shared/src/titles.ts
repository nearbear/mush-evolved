// Ship titles and their lines of succession (#144, decided 2026-10-13 and 2026-10-20). Titles are
// handed out with Mush selection, to the first person in each line, whatever their role. A title
// stays with its holder while they are eligible; when they stop being eligible it passes to the
// first eligible person in the line. A former holder who becomes eligible again does not take it
// back: they get it only through that same succession. With nobody eligible the title is vacant
// until somebody is. The lines and who holds each title are public.

import { pushChat } from "./chat.ts";
import type { CharacterId } from "./characters.ts";
import { EQUIPMENT_TYPES, isEquipmentEnabled } from "./equipment.ts";
import type { GameState, PlayerState, PlayerId } from "./types.ts";
import { hasSkill } from "./skills.ts";

export const TITLE_IDS = ["commander", "neron_admin", "comms_officer"] as const;
export type TitleId = (typeof TITLE_IDS)[number];

/**
 * Each title's line of succession, first in line first: a commenter's proposal on #144, adopted by
 * the owner 2026-10-20. Andie and Derek aren't in our crew yet; they stay in the data (owner's
 * choice) and are skipped, since nobody plays them.
 */
export const SUCCESSION: Readonly<Record<TitleId, readonly (CharacterId | "andie" | "derek")[]>> = {
  commander: [
    "jinsu", "chao", "derek", "gioele", "stephen", "kuanti", "hua", "terrence", "roland",
    "frieda", "andie", "eleesha", "paola", "chun", "janice", "raluca", "finola", "ian",
  ],
  neron_admin: [
    "janice", "raluca", "kuanti", "terrence", "stephen", "eleesha", "frieda", "paola", "jinsu",
    "andie", "finola", "gioele", "chun", "hua", "ian", "chao", "derek", "roland",
  ],
  comms_officer: [
    "paola", "eleesha", "andie", "janice", "stephen", "finola", "roland", "hua", "derek",
    "jinsu", "kuanti", "gioele", "chun", "ian", "terrence", "frieda", "chao", "raluca",
  ],
};

/** Who may hold a title: the living who aren't inactive (inactivity.ts, #145). */
export function eligibleForTitle(p: Readonly<PlayerState>): boolean {
  return p.alive && p.inactivity === undefined;
}

/**
 * Whether a player can use what a title locks without holding it. Today only the freeHacking cheat,
 * which bypasses every title; passing the title keeps the check ready for title-specific access such
 * as the Hacker Kit (not built). The kit stands in for the Commander only while that title is vacant
 * (docs/rules/rules-design.md).
 */
export function bypassesTitles(p: Readonly<Pick<PlayerState, "cheats" | "skills" | "bookSkill" | "mushSkills">>, title: TitleId): boolean {
  if(p.cheats.includes("freeHacking")){
    return true;
  }
  else if(title === "neron_admin" && hasSkill(p, "neron_access")){
    return true;
  }
  return false;
}

/**
 * Whether a player's state/view marks `equipmentId` as currently hacked.
 */
export function hasHackedEquipment(p: Readonly<Pick<PlayerState, "hackedEquipment">>, equipmentId: string): boolean {
  return p.hackedEquipment?.includes(equipmentId) ?? false;
}

/**
 * Whether a player may use something locked to a title: they hold it, they bypass titles, or they have
 * an active hack on a working, enabled equipment in their current room that requires that title.
 * Every title-locked action checks this, not `state.titles`.
 */
export function hasTitleAccess(state: Readonly<GameState>, p: Readonly<PlayerState>, title: TitleId): boolean {
  if (state.titles[title] === p.id || bypassesTitles(p, title)) return true;
  if (!p.hackedEquipment?.length) return false;
  return (state.equipment[p.room] ?? []).some(
    (e) =>
      p.hackedEquipment!.includes(e.id) &&
      !e.broken &&
      isEquipmentEnabled(state, e) &&
      EQUIPMENT_TYPES[e.type]?.title === title,
  );
}

/**
 * Who should hold a title now: the holder while they are eligible, otherwise the first eligible
 * person in the line, or null. Pure: `eligible` decides, so the order rules are tested on their own.
 */
export function successor<P extends { id: PlayerId; character: string }>(
  line: readonly string[],
  people: readonly P[],
  holder: PlayerId | null,
  eligible: (p: P) => boolean,
): PlayerId | null {
  const current = people.find((p) => p.id === holder);
  if (current && eligible(current)) return current.id;
  for (const character of line) {
    const p = people.find((q) => q.character === character);
    if (p && eligible(p)) return p.id;
  }
  return null;
}

/** Every title unheld: a ship in pre-selection, before they are issued. */
export function noTitles(): Record<TitleId, PlayerId | null> {
  return Object.fromEntries(TITLE_IDS.map((id) => [id, null])) as Record<TitleId, PlayerId | null>;
}

/** Every launch key out (#480): at the start, and in pre-selection. */
export function noLaunchKeys(): Record<TitleId, boolean> {
  return Object.fromEntries(TITLE_IDS.map((id) => [id, false])) as Record<TitleId, boolean>;
}

/** Whether all three launch keys are in at the Command terminal (#480): travel to Sol or Eden needs every one. */
export function allLaunchKeysIn(state: Readonly<Pick<GameState, "launchKeys">>): boolean {
  return TITLE_IDS.every((id) => state.launchKeys[id]);
}

/**
 * Gives a title to a new holder (or leaves it vacant). Its launch key goes off whenever the title changes hands, with no
 * log line: the change itself is announced in crew chat (owner, 2026-11-22, #480). Every change of holder goes through here.
 */
export function setTitleHolder(state: GameState, id: TitleId, holder: PlayerId | null): void {
  if (state.titles[id] === holder) return;
  state.titles[id] = holder;
  state.launchKeys[id] = false;
}

/** Hands out every title at the start, with Mush selection. Not announced: the holders are in every view. */
export function assignTitles(players: readonly PlayerState[]): Record<TitleId, PlayerId | null> {
  const titles = {} as Record<TitleId, PlayerId | null>;
  for (const id of TITLE_IDS) titles[id] = successor(SUCCESSION[id], players, null, eligibleForTitle);
  return titles;
}

/**
 * Passes on each title whose holder is no longer eligible, and gives a vacant one to the first
 * eligible person. Call after anything that changes eligibility (death, inactivity, a Transfer). Each
 * change is announced in crew chat only, not in a room log (owner, 2026-10-20).
 */
export function refreshTitles(state: GameState): void {
  if (state.preselection) return; // not issued yet: selectMush does it
  for (const id of TITLE_IDS) {
    const before = state.titles[id];
    const after = successor(SUCCESSION[id], state.players, before, eligibleForTitle);
    if (after === before) continue;
    setTitleHolder(state, id, after);
    const holder = state.players.find((p) => p.id === after);
    pushChat(state, "global", {
      from: null,
      isBot: false,
      text: "",
      system: holder ? { key: "titlePassed", params: { name: holder.character, title: id } } : { key: "titleVacant", params: { title: id } },
    });
  }
}
