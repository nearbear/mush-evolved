import type { BiosOption } from "./bios.ts";
import type { CharacterId } from "./characters.ts";
import type { TurnSide } from "./navigation.ts";

export * from "./types/chat.ts";
export * from "./types/config.ts";
export * from "./types/player.ts";
export * from "./types/state.ts";
export * from "./types/view.ts";

export type PlayerId = string;
export type RoomId = string;
export type Role = "human" | "mush";

/** Which scripted brain drives a bot seat. Absent means "logParrot". */
export type BotKind = "wander" | "logParrot" | "model";

export interface Seat {
  id: PlayerId;
  /** The account's chosen name. Never in a view while the game runs: players know each other only by character. */
  name: string;
  isBot: boolean;
  botKind?: BotKind;
  /** Which crew member this seat plays: their art, and the only name other players see. No effect on the rules. */
  character: CharacterId;
}

/**
 * One line of history. `room` is where it happened (absent = ship-wide, e.g. a
 * new cycle). `visibleTo: "all"` entries are part of that room's history and
 * shown to whoever is in the room; a player list is private to those players.
 */
export interface LogEntry {
  cycle: number;
  /** Wall-clock ms when the server recorded it. The rules have no clock; GameRoom stamps it. Missing on older games. */
  at?: number;
  /** Message id; the client turns it into text (`logEvent.<key>` in the locale catalogs). */
  key: string;
  /** Data for the message. `room`, `item` and `equipment` params are ids the client names; `name`, `target` and `body` are character ids (never a player's own name). */
  params?: LogParams;
  room?: RoomId;
  visibleTo: "all" | PlayerId[];
  /** Set on entries the crew should take notice of: a secret or covert action that leaked into the room log, or an alarm. */
  level?: "warning";
}

/** Values a log message can interpolate. */
export type LogParams = Record<string, string | number>;

export type ItemId = string;

/** Where an item is: a player's inventory or a room's (unlimited) storage. */
export type Container = { kind: "player"; id: PlayerId } | { kind: "room"; id: RoomId };

export interface ItemState {
  id: ItemId;
  /** Key into ITEM_TYPES (items.ts). */
  type: string;
  at: Container;
  /** For a corpse: whose body it is. */
  of?: PlayerId;
  /** For a blueprint: the key of the recipe it carries (BLUEPRINTS in blueprints.ts). */
  builds?: string;
  /** For a microwave: express cooks left. */
  charges?: number;
  /** For a skill book: the skill id it teaches (SKILLS in skills.ts). */
  teaches?: string;
  /** For a food item a Mush filled with spores (Fungal cuisine): the contamination it passes to a human who eats it. Mush-only in views. */
  spores?: number;
  /** For a hydropot with something growing in it (botany.ts). An empty pot has none. */
  plant?: PlantState;
}

/** A plant in a hydropot (owner, 2026-10-22; docs/scratchpad/botany-plan.md, Pass 1). */
export interface PlantState {
  /** The fruit item type it grows from and produces (only `fruit_banana` for now). */
  species: string;
  /** Cycles since it was sown while young; null once adult. */
  age: number | null;
  /** 0 healthy, 1 thirsty, 2 dried. Public. */
  thirst: 0 | 1 | 2;
  /** Hidden: only the Botanist role sees it (`isBotanistRole`). */
  sick: boolean;
}

/**
 * Something a player can inspect and act on: a person, a piece of room
 * equipment, or an item.
 */
export type Target = { kind: "player"; id: PlayerId } | { kind: "equipment"; id: string } | { kind: "item"; id: ItemId };

export type Action =
  | { type: "move"; to: RoomId }
  | { type: "take"; item: ItemId }
  | { type: "drop"; item: ItemId }
  | { type: "dismantle"; item: ItemId }
  | { type: "dismantle"; equipment: string }
  | { type: "dispense"; equipment: string }
  | { type: "consume"; item: ItemId }
  | { type: "cook"; item: ItemId }
  | { type: "water"; item: ItemId }
  | { type: "treat"; item: ItemId }
  | { type: "sow"; item: ItemId; fruit: ItemId }
  | { type: "express_cook"; item: ItemId }
  | { type: "build"; item: ItemId }
  | { type: "jettison"; item: ItemId }
  | { type: "install"; item: ItemId }
  | { type: "uninstall"; equipment: string }
  | { type: "examine"; target: Target }
  | { type: "bond"; target: PlayerId }
  | { type: "dtt"; target: PlayerId }
  | { type: "stt"; target: PlayerId }
  | { type: "extract_spore" }
  | { type: "lie_down"; equipment: string }
  | { type: "get_up" }
  | { type: "accommodate"; target: PlayerId }
  | { type: "accept_accommodation"; target: PlayerId }
  | { type: "stop_accommodation"; target: PlayerId }
  | { type: "shower"; equipment: string }
  | { type: "access"; equipment: string }
  | { type: "research"; equipment: string; research: string }
  | { type: "project"; equipment: string; project: string }
  | { type: "repair_pilgred"; equipment: string }
  | { type: "return_to_sol"; equipment: string }
  | { type: "turn_ship"; equipment: string; side: TurnSide }
  | { type: "travel"; equipment: string }
  | { type: "leave_orbit"; equipment: string }
  | { type: "take_fuel"; equipment: string }
  | { type: "load_fuel"; equipment: string }
  | { type: "unload_fuel"; equipment: string }
  | { type: "return_fuel"; equipment: string }
  | { type: "take_oxygen"; equipment: string }
  | { type: "return_oxygen"; equipment: string }
  | { type: "check_combustion"; equipment: string }
  | { type: "contact_sol"; equipment: string }
  | { type: "decode_rebel"; equipment: string; base: string }
  | { type: "contact_xyloph"; equipment: string }
  | { type: "update_neron"; equipment: string }
  | { type: "set_bios"; equipment: string; option: BiosOption; value: boolean }
  | { type: "scan_planet"; equipment: string }
  | { type: "analyze_planet"; equipment: string; planet: string }
  | { type: "delete_planet"; planet: string }
  | { type: "turret_attack"; equipment: string; hunter: string }
  | { type: "repair_hull"; item: ItemId }
  | { type: "takeoff"; equipment: string }
  | { type: "land"; equipment: string }
  | { type: "heal"; target: PlayerId }
  | { type: "vaccinate"; target: PlayerId }
  | { type: "punch"; target: PlayerId }
  | { type: "interrogate"; target: PlayerId }
  | { type: "chitchat"; target: PlayerId }
  | { type: "anathema"; target: PlayerId }
  | { type: "fiery_speech" }
  | { type: "boring_speech" }
  | { type: "attack"; weapon: ItemId; target: PlayerId }
  | { type: "attack"; weapon: ItemId }
  | { type: "spike"; target: PlayerId }
  | { type: "fungal_cuisine"; item: ItemId }
  | { type: "body_transfer"; target: PlayerId }
  | { type: "pick_skill"; skill: string }
  | { type: "read_book"; item: ItemId }
  | { type: "self_disease" }
  | { type: "ready" };
