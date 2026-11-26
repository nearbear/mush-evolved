// ---- Radio Piracy ------------------------------------------------------------
// The Mush skill `radio_piracy`, reworked (owner, 2026-11-18, rules-design.md "Radio Pirate, reworked"). A hacker places
// a hack on another player's iTrackie at the Com center (actions/radio_piracy.ts). While it lasts the hacker reads the
// target's channels from the hack on (never earlier history), private channels included, and can post as the target in
// every channel the target can post in. A spoof reaches everyone in the channel but the target: it goes into the
// target's `unheard` like a message a deaf player missed, so the target's view never carries it and it is never unread.
// Nobody is told. The hack ends on the target's factory reset (actions/factory_reset.ts), the hacker's next hack,
// either one's death, or the hacker's Transfer.
//
// Owner's answers (2026-11-26): the hacker uses the hack through their own iTrackie (no iTrackie, comatose, or no longer
// Mush with the skill: the hack goes quiet but lasts); a spoof is written as the target would write it (the target's
// Torn Tongue refuses it, their Missing Teeth drops letters); the gaps a spoof leaves in the target's message numbers
// are accepted for now (only visible in network data, as for a deaf player).

import { chatChannels, inRanges, MAX_CHAT_LENGTH, pushChat, readChannels, withSeq } from "./chat.ts";
import { cloneState, fail, type ActionResult } from "./helpers.ts";
import { logPrivate } from "./log.ts";
import { isMute, spokenText } from "./modifiers.ts";
import { hasSkill } from "./skills.ts";
import { isComatose } from "./statuses.ts";
import { MUSH_CHANNEL } from "./types.ts";
import type { ChannelId, GameState, PlayerId, PlayerState } from "./types.ts";

/** What an active hack gives its hacker now: the target and the channels the hacker may post in as them. */
export interface ActiveHack {
  target: Readonly<PlayerState>;
  /** The target's posting channels (`chatChannels`) but the Mush channel, which is not a device. */
  channels: ChannelId[];
}

/**
 * The hacker's hack if they can use it now, or null: a living, conscious Mush with the skill, who can reach global chat
 * through their own iTrackie (or the rebel base's brain probes), hacking a living target. The target's channels come
 * from the target's own iTrackie, so a target without one gives an empty list.
 */
export function activeHack(state: Readonly<GameState>, hacker: Readonly<PlayerState>): ActiveHack | null {
  const hack = hacker.radioHack;
  if (!hack || !hacker.alive || hacker.role !== "mush" || !hasSkill(hacker, "radio_piracy") || isComatose(state, hacker)) return null;
  if (!chatChannels(state, hacker).includes("global")) return null;
  const target = state.players.find((p) => p.id === hack.target);
  if (!target || !target.alive) return null;
  return { target, channels: chatChannels(state, target).filter((c) => c !== MUSH_CHANNEL) };
}

/** Whether `hackerId` has a usable hack on `targetId` (a chat input's `as` must name the hack's target). */
export function activeHackOn(state: Readonly<GameState>, hackerId: PlayerId, targetId: PlayerId): boolean {
  const hacker = state.players.find((p) => p.id === hackerId);
  return !!hacker && activeHack(state, hacker)?.target.id === targetId;
}

/**
 * Every channel `player` reads now and the first message (`seq`) they may read in each: 0 for their own channels
 * (`readChannels`), and for a channel they read only through a hack, its count when the hack was placed.
 */
export function readableFrom(state: Readonly<GameState>, player: Readonly<PlayerState>): Map<ChannelId, number> {
  const out = new Map<ChannelId, number>(readChannels(state, player).map((c) => [c, 0]));
  const hack = activeHack(state, player);
  if (hack) for (const c of hack.channels) if (!out.has(c)) out.set(c, player.radioHack!.chatSeq[c] ?? 0);
  return out;
}

/** The channels `player` reads only through their hack (the target's private channels they aren't in). */
export function tappedChannels(state: Readonly<GameState>, player: Readonly<PlayerState>): ChannelId[] {
  const own = new Set(readChannels(state, player));
  return activeHack(state, player)?.channels.filter((c) => !own.has(c)) ?? [];
}

/** Places a hack on `target`, replacing the hacker's last one. Mutates a state that the caller already cloned. */
export function placeHack(state: GameState, hacker: PlayerState, target: PlayerId): void {
  hacker.radioHack = { target, chatSeq: { ...state.chatSeq } };
  hacker.radioHackToday = true;
}

/**
 * The target's factory reset: every hack on their iTrackie ends, and each hacker who lost one gets a private line.
 * Returns how many ended. Mutates a state that the caller already cloned.
 */
export function resetHacksOn(state: GameState, target: Readonly<PlayerState>): number {
  let ended = 0;
  for (const p of state.players) {
    if (p.radioHack?.target !== target.id) continue;
    delete p.radioHack;
    logPrivate(state, p.id, "radioHackLost", { target: target.character });
    ended++;
  }
  return ended;
}

/** A death ends the dead player's own hack and every hack on them, silently. Mutates a state the caller already cloned. */
export function endHacksOnDeath(state: GameState, dead: PlayerState): void {
  delete dead.radioHack;
  for (const p of state.players) if (p.radioHack?.target === dead.id) delete p.radioHack;
}

/**
 * The hacker posts `text` in `channel` as their target. The message is the target's (`from`, `isBot`) and is written as
 * the target would write it; the target never receives it (`unheard`). Chat, not an Action; the server moderates first.
 */
export function spoofChat(state: GameState, hackerId: PlayerId, channel: ChannelId, text: string): ActionResult {
  const hacker = state.players.find((p) => p.id === hackerId);
  if (!hacker) return fail("unknown_player");
  const hack = activeHack(state, hacker);
  if (!hack || !hack.channels.includes(channel)) return fail("cant_post");
  if (isMute(hack.target)) return fail("cant_speak");
  if (text.trim().length > MAX_CHAT_LENGTH) return fail("message_too_long");
  const body = spokenText(hack.target, text.trim()).trim();
  if (!body) return fail("empty_message");

  const next = cloneState(state);
  const target = next.players.find((p) => p.id === hack.target.id)!;
  const seq = next.chatSeq[channel] ?? 0;
  pushChat(next, channel, { from: target.id, isBot: target.isBot, text: body });
  const unheard = (target.unheard ??= {});
  if (!inRanges(unheard[channel], seq)) unheard[channel] = withSeq(unheard[channel] ?? [], seq);
  return { ok: true, state: next };
}
