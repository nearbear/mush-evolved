import { Action, peopleHere, type ActionTag, type ActionVisibility, isString } from "./action.ts";
import { isInactive } from "../inactivity.ts";
import { logPrivate } from "../log.ts";
import { swapMinds } from "../mind.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type BodyTransferActionData = { type: "body_transfer"; target: string };

/**
 * Transfer, the Mush skill `transfert` (owner, 2026-10-24, rules-design.md; eMushpedia `Transfert`): once per game,
 * free (`bodyTransfer.cost.ap`) and instant, a Mush takes over the body of a living human in their room whose
 * contamination is at least 1 (Antique Perfume immunity doesn't stop it) and who isn't inactive (owner, 2026-10-31,
 * #145). The minds swap (`swapMinds`): the Mush player now plays the target's body, which becomes Mush; the victim
 * plays the old body, now human with no contamination and no spores, at satiety 0 and counting toward hunger from this cycle. The new Mush body keeps its
 * satiety but stops counting toward hunger, as Mush do. Bodies keep everything else (AP, HP, morale, inventory,
 * human skills, titles, channels). Private: only the Mush gets a log line; the victim gets a pop-up naming who took
 * their body (`bodyTakenBy`). Aggressive, and a `spore` action, so myco-alarms ring.
 */
export class BodyTransferAction extends Action<BodyTransferActionData> {
  override visibility: ActionVisibility = "private";
  override tags: readonly ActionTag[] = ["spore", "aggressive"];
  override timed = false;

  constructor() {
    super("body_transfer", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.bodyTransfer.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): BodyTransferActionData[] {
    if (!canTransfer(player)) return [];
    return peopleHere(state, player)
      .filter((o) => eligible(state, o) && !isInactive(o))
      .map((o) => ({ type: "body_transfer", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: BodyTransferActionData): string | null {
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "transfert")) return "no_skill";
    if (player.transferUsed) return "already_used";
    const victim = peopleHere(state, player).find((o) => o.id === target.target);
    if (!victim) return "cant_see";
    if (victim.role !== "human") return "not_human";
    if (!eligible(state, victim)) return "not_contaminated";
    if (isInactive(victim)) return "inactive";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: BodyTransferActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    const taker = player.character;
    swapMinds(state, player, victim);
    // `player` is the old body, now the victim's (human); `victim` is the Mush's new body.
    delete state.contamination[victim.id];
    delete state.contamination[player.id];
    player.satiety = 0;
    player.satietyZeroSince = state.cycle;
    victim.satietyZeroSince = null;
    victim.transferUsed = true;
    player.bodyTakenBy = taker;
    logPrivate(state, victim.id, "bodyTransferred", { name: taker, target: victim.character });
  }
}

const canTransfer = (p: Readonly<PlayerState>): boolean => p.role === "mush" && hasSkill(p, "transfert") && !p.transferUsed;

/** A living human with some contamination (the caller checks they are in the room). */
const eligible = (state: Readonly<GameState>, o: Readonly<PlayerState>): boolean => o.role === "human" && (state.contamination[o.id] ?? 0) >= 1;
