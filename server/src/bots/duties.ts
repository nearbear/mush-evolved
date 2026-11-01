// What a bot does because of the skills and titles it holds (#222; owner, 2026-11-01: no static per-character role).
// Owner-approved 2026-11-01; the owner edits it directly. Nothing reads it yet: the scripted goals for its triggers and
// the model prompt lines are the next steps (#222).
//
// How to edit:
// - `priority`: where a scripted bot (no key) puts this among its goals. For reference, today's goals are
//   returnToSol 100, pickSkill 90, eat 80, shower 70, repairHull 55, research and project 50, rest 40, explore 30.
// - `when`: one of the triggers in `DutyTrigger`, each explained there. A new kind of trigger needs code first.
// - `prompt`: one line a model bot is shown when it holds the skill or title. English for now (bot language: #95).
// - Several rows may share a skill or title. Leave notes in comments freely.

import type { Action, SkillId, TitleId } from "@mush2/shared";

export type DutyTrigger =
  /** Works by itself; no goal. The prompt line just tells a model bot it has it. */
  | "passive"
  /** The mechanic isn't built yet; the row records what the bot should do once it is. No code until then. */
  | "waits"
  /** Model bots only: acting on other people (heal, morale) happens through chat and `help` (docs/plans/bot-goals.md). Scripted bots do nothing. */
  | "model"
  /** Once a day, when affordable within the AP reserve. */
  | "daily"
  /** While hunters attack the ship (`view.hunters.count`, public). */
  | "hunters"
  /** While a plant the bot can see is thirsty, dried, or (for the Botanist) sick. Seen only on arrival in the garden. */
  | "plants"
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
  { skill: "astrophysician", when: "daily", actions: ["scan_planet", "analyze_planet"], priority: 52, prompt: "You're the Astrophysicist: scanning finds planets for 1 AP less, and your analyses reveal an extra sector." },
  { skill: "botanic", when: "plants", actions: ["water", "treat", "sow"], priority: 53, prompt: "You're the Botanist: you see sick plants, and garden points make garden work free." },
  // Green Thumb isn't in SKILL_STATUS, so it does nothing yet.
  { skill: "green_thumb", when: "waits", prompt: "" },
  // Already counted: the research and project goals spend free points first.
  { skill: "designer", when: "passive", prompt: "You're a Designer: your points make work on NERON projects free." },
  { skill: "computer", when: "passive", prompt: "You're an IT Expert: your points make research and NERON project work free." },
  { skill: "medic", when: "model", actions: ["heal"], prompt: "You're a Medic: your heals restore 2 more HP. Offer when someone asks for healing." },
  { skill: "paranoid", when: "passive", prompt: "" },
  // Its benefits are PILGRED points, and bots leave PILGRED alone in single player (owner, 2026-11-01).
  { skill: "physicist", when: "waits", prompt: "" },
  { skill: "shrink", when: "model", actions: ["comfort"], prompt: "You're a Shrink: Comfort gives someone 2 morale, and people resting in your room gain morale. Offer when someone is low." },
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
  { skill: "leadership", when: "model", actions: ["fiery_speech"], prompt: "You're a Leader: a Fiery speech gives 2 morale to everyone in your room." },
  { skill: "first_aid", when: "model", actions: ["heal"], prompt: "You know First Aid: you have free heal points. Offer when someone asks for healing." },

  // --- Titles ---
  // Steering spends fuel and decides where the ship goes; no strategy decided, so model only for now.
  { title: "commander", when: "model", actions: ["turn_ship", "travel", "leave_orbit"], prompt: "You're the Commander: only you can steer the ship and, once PILGRED is repaired, take it home." },
  // BIOS settings are free; no strategy decided.
  { title: "neron_admin", when: "model", actions: ["set_bios"], prompt: "You're NERON's Admin: only you can change NERON's BIOS settings." },
  { title: "comms_officer", when: "linkUp", actions: ["decode_rebel", "update_neron", "contact_xyloph"], priority: 52, prompt: "You're the Comms Officer: while the link with Sol is up, you decode rebel signals, update NERON and contact Xyloph." },
];
