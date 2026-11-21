// What a bot does because of the skills and titles it holds (#222; owner, 2026-11-01: no static per-character role).
// Owner-approved 2026-11-01; the owner edits it directly. Goal definitions read their priorities and triggers from
// `BOT_DUTIES`, and `buildPrompt` includes each held duty's `prompt` line (#222).
//
// How to edit:
// - `priority`: where a scripted bot (no key) puts this among its goals. For reference, today's goals are
//   returnToSol 100, pickSkill 90, snoop 85, sowHere 81 (any bot, not Hungry), eat 80, selfCare 79 (any bot but a Shrink, #452), comfort 79 (Shrink, #452), extinguish 78 (any bot, #429), repairOxygen 77.5 (any bot, #443), travel 77 (Commander), loadFuel 76.6 (any bot but the Commander, the fuel relay), deliverCoffee and coffeeRun 76.5 (the coffee relay for Gioele), astro 76 (Astrophysicist),
//   patrolShootHunters 75 (Pilot), shootHunters 74 (Shooter/Gunner), fierySpeech 71 (Leader), shower 70, repairDoor 56 (any bot), repairHull 55, contactSol 54 (Radio
//   Expert), setOutPots 54 (Botanist role, Green Thumb), tendPlants 53 (Botanist role), commsOfficer 52 (Comms Officer), crewShootHunters 51 (anyone without a shooting skill), research and project 50, shrinkDorm 45
//   (Shrink role), rest 40, isolate 35 (Antisocial, #470), explore 30.
// - `when`: one of the triggers in `DutyTrigger`, each explained there. A new kind of trigger needs code first.
// - `prompt`: one line a model bot is shown when it holds the skill or title. English for now (bot language: #95).
// - Several rows may share a skill or title. Leave notes in comments freely.

import type { Action, PlayerView, SkillId, TitleId } from "@mush2/shared";

export type DutyTrigger =
  /** Works by itself; no goal. The prompt line just tells a model bot it has it. */
  | "passive"
  /** The mechanic isn't built yet; the row records what the bot should do once it is. No code until then. */
  | "waits"
  /** Model bots only: acting on other people (heal, morale) happens through chat and `help` (docs/plans/bot-goals.md). Scripted bots do nothing (owner, 2026-11-01: deferred). */
  | "model"
  /** Once a day, a dormitory: Alpha and Beta on alternate days, staying until the cycle ends (`shrinkDorm`). */
  | "dorm"
  /** Once a day, when affordable within the AP reserve. */
  | "daily"
  /** Each cycle while there is planet work: deleting, sharing the destination, analyzing, scanning (#417). */
  | "astro"
  /**
   * Preparing and holding jumps for the ship when not traveling or in orbit: to a shared destination (planetShare.ts,
   * #417) or an escape jump into empty space (#421). In orbit, leaving it once every sector is explored (#417).
   */
  | "destination"
  /** While hunters attack the ship (`view.hunters.count`, public). */
  | "hunters"
  /** While a plant the bot can see is thirsty, dried, or (for the Botanist) sick. Seen only on arrival in the garden. */
  | "plants"
  /** Once a game, early: carried empty hydropots, then any known or storage room's, go to the garden floor (`setOutPots`). */
  | "pots"
  /** While the link with Sol is down (`view.comms.linked`, public). */
  | "linkDown"
  /** While the link with Sol is up. */
  | "linkUp";

export interface Duty {
  /** Exactly one of `skill` or `title`. */
  skill?: SkillId;
  title?: TitleId;
  when: DutyTrigger;
  /** The actions this duty uses; checked against the action list, so a typo fails the typecheck. */
  actions?: readonly Action["type"][];
  /** Scripted bots only; ignored for "passive", "waits" and "model". */
  priority?: number;
  /** For model bots. */
  prompt: string;
}

export const BOT_DUTIES: readonly Duty[] = [
  // --- Skills on the bot pick list (BOT_SKILL_RULES), in its order ---
  { skill: "logistics", when: "passive", prompt: "You're a Logistics Expert: each cycle you give 1 AP to someone in your room, so ending cycles near others helps them." },
  { skill: "pilot", when: "hunters", actions: ["takeoff", "patrol_attack", "land"], priority: 75, prompt: "You're a Pilot: when hunters attack, a patrol ship can shoot them down." },
  { skill: "gunman", when: "hunters", actions: ["turret_attack", "patrol_attack"], priority: 74, prompt: "You're a Shooter: your Shoot points make turret and patrol ship shots free while hunters attack." },
    // Owner, 2026-11-12 (#417): looks for an oxygen planet and a fuel planet, deletes the rest, shares the destination.
  // Outweighs piloting (owner, 2026-11-12): Frieda is both, and hunter sorties used to take the AP the search needs.
  { skill: "astrophysician", when: "astro", actions: ["scan_planet", "analyze_planet", "delete_planet"], priority: 76, prompt: "You're the Astrophysicist: scanning finds planets for 1 AP less, and your analyses reveal an extra sector." },
  { skill: "botanic", when: "plants", actions: ["water", "treat", "sow"], priority: 53, prompt: "You're the Botanist: you see sick plants, and garden points make garden work free." },
  // Owner, 2026-11-12: sets out its pots (Green Thumb's two, then Front Storage's) in the garden, so bananas get sown.
  { skill: "botanic", when: "pots", actions: ["take", "drop"], priority: 54, prompt: "" },
  // Green Thumb gives 2 empty hydropots when picked; they go to the garden floor (owner, 2026-11-12).
  { skill: "green_thumb", when: "pots", actions: ["take", "drop"], priority: 54, prompt: "You have a Green Thumb: set out your empty hydropots in the garden so bananas can be sown in them." },
  // Already counted: the research and project goals spend free points first.
  { skill: "designer", when: "passive", prompt: "You're a Designer: your points make work on NERON projects free." },
  { skill: "computer", when: "passive", prompt: "You're an IT Expert: your points make research and NERON project work free." },
  { skill: "medic", when: "model", actions: ["heal"], prompt: "You're a Medic: your heals restore 2 more HP. Offer when someone asks for healing." },
  { skill: "paranoid", when: "passive", prompt: "" },
  // Its benefits are PILGRED points, and bots leave PILGRED alone in single player (owner, 2026-11-01).
  { skill: "physicist", when: "waits", prompt: "" },
  { skill: "shrink", when: "model", actions: ["comfort"], prompt: "You're a Shrink: early in the game, tell everyone in global chat that you are one. Comfort gives someone 2 morale for 1 AP, and people resting in your room gain morale. Keep your AP for comforting: research and NERON projects only when you are within 4 AP of your max. When someone tells you their morale is under 7, comfort them even if it uses your last 2 AP; otherwise comfort them up to full while keeping 2 AP." },
  // Owner, 2026-11-01: people lying in a bed with a Shrink in the room gain morale, so once a day it spends the night in a dorm.
  { skill: "shrink", when: "dorm", actions: ["lie_down"], priority: 45, prompt: "People resting in your room gain morale, so spend the night in a dormitory." },
  // Owner, 2026-11-18 (#452): once a day, a Fiery speech where the Leader stands, when at least 3 others are there
  // (`fierySpeech`). Picked right after Shrink.
  { skill: "leadership", when: "daily", actions: ["fiery_speech"], priority: 71, prompt: "You're a Leader: a Fiery speech gives 2 morale to everyone else in your room, so give one when the room is crowded." },
  // Owner, 2026-11-01: equipment repair is its real job, not built yet. Doubled renovation odds are built (renovate,
  // patrol ships) but compete with the hull for scrap.
  { skill: "engineer", when: "waits", prompt: "" },
  // Tracker and Lethargy aren't in SKILL_STATUS, so they do nothing yet.
  { skill: "hunt", when: "waits", prompt: "" },
  { skill: "lethargy", when: "waits", prompt: "" },
  { skill: "stickler", when: "passive", prompt: "" },
  { skill: "radio_expert", when: "linkDown", actions: ["contact_sol"], priority: 54, prompt: "You're a Radio Expert: your odds of linking with Sol are doubled." },

  // --- Other built skills a bot can get from a random pick ---
  { skill: "gunner", when: "hunters", actions: ["turret_attack"], priority: 74, prompt: "You're a Gunner: your turret shots hit twice as often and twice as hard." },
  { skill: "first_aid", when: "model", actions: ["heal"], prompt: "You know First Aid: you have free heal points. Offer when someone asks for healing." },

  // --- Titles ---
  // Owner, 2026-11-12 (#417, #421): prepares jumps in advance and holds `travel` until hunters >= 8, 4 days of holding,
  // or oxygen <= 8 with a shared planet in reach (Run D: oxygen never triggers an escape jump; else 1-fuel escape jump
  // on the current heading).
  // Above astro (owner, 2026-11-12): it costs a few AP and is what the search is for. Leaves orbit once every sector
  // is explored, by the shared expedition reports (#417).
  { title: "commander", when: "destination", actions: ["check_combustion", "take_fuel", "load_fuel", "unload_fuel", "turn_ship", "travel", "leave_orbit"], priority: 77, prompt: "You're the Commander: only you can steer the ship and, once PILGRED is repaired, take it home." },
  // BIOS settings are free; no strategy decided.
  { title: "neron_admin", when: "model", actions: ["set_bios"], prompt: "You're NERON's Admin: only you can change NERON's BIOS settings." },
  { title: "comms_officer", when: "linkUp", actions: ["decode_rebel", "update_neron", "contact_xyloph"], priority: 52, prompt: "You're the Comms Officer: while the link with Sol is up, you decode rebel signals, update NERON and contact Xyloph." },
];

const SHRINK_ANNOUNCE = "early in the game, tell everyone in global chat that you are one. ";

/** Whether the bot holds `skill` (picked or from a skill book). */
export const hasBotSkill = (view: PlayerView, skill: SkillId): boolean =>
  view.you.skills.includes(skill) || view.you.bookSkill === skill;

/** Whether the bot currently holds `title`. */
export const hasBotTitle = (view: PlayerView, title: TitleId): boolean =>
  view.titles.some((t) => t.id === title && t.holder === view.you.character);

/** Whether `duty` applies to this bot's held skills and titles. */
export const holdsDuty = (view: PlayerView, duty: Duty): boolean =>
  (duty.skill !== undefined && hasBotSkill(view, duty.skill)) ||
  (duty.title !== undefined && hasBotTitle(view, duty.title));

/** Whether the bot holds any duty with trigger `when` passing `test`. */
export const holdsTrigger = (view: PlayerView, when: DutyTrigger, test: (duty: Duty) => boolean = () => true): boolean =>
  BOT_DUTIES.some((d) => d.when === when && test(d) && holdsDuty(view, d));

/** The priority configured in `BOT_DUTIES` for trigger `when` (matching `test`). */
export function dutyPriority(when: DutyTrigger, test: (duty: Duty) => boolean = () => true): number {
  const duty = BOT_DUTIES.find((d) => d.when === when && d.priority !== undefined && test(d));
  if (!duty?.priority) throw new Error(`Missing priority for duty trigger "${when}"`);
  return duty.priority;
}

/**
 * The prompt lines from `BOT_DUTIES` for every skill and title the bot currently holds. Once a Shrink has announced
 * itself in global chat (`shrinks.has(view.you.id)`), the "tell everyone in global chat" clause is dropped so it
 * doesn't keep re-announcing.
 */
export function dutyPrompts(view: PlayerView, shrinks?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const duty of BOT_DUTIES) {
    if (duty.when === "waits" || !duty.prompt || !holdsDuty(view, duty)) continue;
    const line = duty.skill === "shrink" && shrinks?.has(view.you.id) ? duty.prompt.replace(SHRINK_ANNOUNCE, "") : duty.prompt;
    out.push(line);
  }
  return out;
}
