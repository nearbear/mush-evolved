// Display names for ids the server sends: rooms, equipment, items, crew, and log
// events. The server never sends English text (see the i18n skill); these
// helpers turn ids into the player's language. Call `useNames()` in a
// component so it re-renders when the language changes.

import { BLUEPRINTS, characterGivenName, characterName, type ActionType, type ItemView, type LogEntry, type RoomId } from "@mush2/shared";
import { useTranslation } from "react-i18next";

/** The name of each kind of action, for the action queue and log lines that mention one. Ready never waits in a queue. */
const ACTION_NAME_KEYS = {
  move: "actions.move",
  take: "actions.take",
  drop: "actions.drop",
  dismantle: "actions.dismantle",
  access: "actions.access",
  research: "actions.research",
  project: "actions.project",
  repair_pilgred: "actions.repairPilgred",
  return_to_sol: "actions.returnToSol",
  contact_sol: "actions.contactSol",
  decode_rebel: "actions.decodeRebel",
  contact_xyloph: "actions.contactXyloph",
  update_neron: "actions.updateNeron",
  set_bios: "actions.setBios",
  scan_planet: "actions.scanPlanet",
  analyze_planet: "actions.analyzePlanet",
  delete_planet: "actions.deletePlanet",
  dispense: "actions.dispense",
  consume: "actions.consume",
  cook: "actions.cook",
  express_cook: "actions.expressCook",
  build: "actions.build",
  jettison: "actions.jettison",
  install: "actions.install",
  uninstall: "actions.uninstall",
  examine: "actions.examine",
  bond: "actions.bond",
  dtt: "actions.dtt",
  stt: "actions.stt",
  extract_spore: "actions.extractSpore",
  spike: "actions.spike",
  lie_down: "actions.lieDown",
  get_up: "actions.getUp",
  accommodate: "actions.accommodate",
  accept_accommodation: "actions.acceptAccommodation",
  stop_accommodation: "actions.stopAccommodation",
  shower: "actions.shower",
  heal: "actions.heal",
  punch: "actions.punch",
  pick_skill: "actions.pickSkill",
  read_book: "actions.readBook",
} as const satisfies Record<Exclude<ActionType, "ready">, string>;

export function useNames() {
  const { t } = useTranslation();
  // Dynamic keys, so the id falls back to itself when a catalog lacks it.
  const lookup = (group: "rooms" | "equipment" | "items", id: string): string => t(`${group}.${id}` as never, { defaultValue: id });
  const room = (id: RoomId) => lookup("rooms", id);
  const skill = (id: string) => t(`skills.names.${id}` as never, { defaultValue: id });
  const equipment = (type: string) => lookup("equipment", type);
  /** A blueprint is named for what it builds. */
  const item = (type: string, builds?: string) => {
    if (builds === undefined) return lookup("items", type);
    const makes = BLUEPRINTS[builds]?.makes;
    const thing = makes && "item" in makes ? lookup("items", makes.item) : lookup("equipment", makes ? makes.equipment : builds);
    return t("items.blueprintOf" as never, { thing, defaultValue: type });
  };
  /** An item as the view has it: a blueprint is named for what it builds, a skill book for its skill. */
  const itemOf = (it: Pick<ItemView, "type" | "builds" | "teaches">) =>
    it.teaches === undefined ? item(it.type, it.builds) : t("items.bookOf" as never, { skill: skill(it.teaches), defaultValue: it.type });
  const research = (id: string) => t(`research.names.${id}` as never, { defaultValue: id });
  const project = (id: string) => t(`projects.names.${id}` as never, { defaultValue: id });
  const title = (id: string) => t(`titles.names.${id}` as never, { defaultValue: id });
  const rebelBase = (id: string) => t(`comms.rebels.${id}.name` as never, { defaultValue: id });
  const action = (type: string) => {
    const key = (ACTION_NAME_KEYS as Partial<Record<string, string>>)[type];
    return key ? t(key as never, { defaultValue: type }) : type;
  };

  /** The text of a log entry. `room`, `item`, `research`, `project`, `equipment`, `action`, `title`, `skill`, `base` (a rebel base) and `entry` (a Xyloph entry) params are ids and get translated; `name`, `target` and `body` are character ids. */
  const logLine = ({ key, params = {} }: Pick<LogEntry, "key" | "params">): string => {
    const resolved: Record<string, string | number> = { ...params };
    if (typeof params.room === "string") resolved.room = room(params.room);
    if (typeof params.item === "string") resolved.item = item(params.item);
    if (typeof params.research === "string") resolved.research = research(params.research);
    if (typeof params.project === "string") resolved.project = project(params.project);
    if (typeof params.equipment === "string") resolved.equipment = equipment(params.equipment);
    if (typeof params.action === "string") resolved.action = action(params.action);
    if (typeof params.title === "string") resolved.title = title(params.title);
    if (typeof params.skill === "string") resolved.skill = skill(params.skill);
    if (typeof params.base === "string") resolved.base = rebelBase(params.base);
    if (typeof params.entry === "string") resolved.entry = t(`comms.xyloph.${params.entry}` as never, { defaultValue: params.entry });
    for (const who of ["name", "target", "body"] as const) if (typeof params[who] === "string") resolved[who] = characterGivenName(params[who]);
    return t(`logEvent.${key}` as never, { ...resolved, defaultValue: key });
  };

  return { room, equipment, item, itemOf, research, project, skill, title, rebelBase, action, character: characterName, characterGiven: characterGivenName, logLine };
}
