// Display names for ids the server sends: rooms, equipment, items, crew, and log
// events. The server never sends English text (see the i18n skill); these
// helpers turn ids into the player's language. Call `useNames()` in a
// component so it re-renders when the language changes.

import { BLUEPRINTS, DELOGGED_KEY, LOST_PLACE_NAME, SOMEONE, characterGivenName, characterName, hybridParents, type ActionType, isLostPlace, type ItemView, type LogEntry, type RoomId } from "@mush2/shared";
import { useTranslation } from "react-i18next";

/** The name of each kind of action, for the action queue and log lines that mention one. Ready never waits in a queue. */
const ACTION_NAME_KEYS = {
  move: "actions.move",
  take: "actions.take",
  drop: "actions.drop",
  dismantle: "actions.dismantle",
  access: "actions.access",
  hack: "actions.hack",
  research: "actions.research",
  spoil_research: "actions.spoilResearch",
  contaminate: "actions.contaminate",
  project: "actions.project",
  repair_pilgred: "actions.repairPilgred",
  return_to_sol: "actions.returnToSol",
  travel_to_eden: "actions.travelToEden",
  compute_eden: "actions.computeEden",
  turn_ship: "actions.turnShip",
  set_launch_key: "actions.setLaunchKey",
  travel: "actions.travel",
  leave_orbit: "actions.leaveOrbit",
  take_fuel: "actions.takeFuel",
  load_fuel: "actions.loadFuel",
  unload_fuel: "actions.unloadFuel",
  return_fuel: "actions.returnFuel",
  take_oxygen: "actions.takeOxygen",
  return_oxygen: "actions.returnOxygen",
  check_combustion: "actions.checkCombustion",
  contact_sol: "actions.contactSol",
  decode_rebel: "actions.decodeRebel",
  contact_xyloph: "actions.contactXyloph",
  update_neron: "actions.updateNeron",
  contact_signal: "actions.contactSignal",
  close_deal: "actions.closeDeal",
  refuse_signal: "actions.refuseSignal",
  set_bios: "actions.setBios",
  scan_planet: "actions.scanPlanet",
  turret_attack: "actions.turretAttack",
  patrol_attack: "actions.turretAttack",
  repair_hull: "actions.repairHull",
  repair: "actions.repair",
  extinguish: "actions.extinguish",
  ignite: "actions.ignite",
  sabotage: "actions.sabotage",
  sabotage_door: "actions.sabotageDoor",
  green_jelly: "actions.greenJelly",
  reinforce: "actions.reinforce",
  upgrade_drone: "actions.upgradeDrone",
  extinguish_manually: "actions.extinguishManually",
  takeoff: "actions.takeoff",
  board_icarus: "actions.board_icarus",
  leave_icarus: "actions.leave_icarus",
  icarus_takeoff: "actions.icarus_takeoff",
  land_on_planet: "actions.land_on_planet",
  u_turn: "actions.u_turn",
  sabotage_expedition: "actions.sabotage_expedition",
  land: "actions.land",
  collect_scrap: "actions.collectScrap",
  renovate: "actions.renovate",
  open_capsule: "actions.openCapsule",
  open_lunchbox: "actions.openLunchbox",
  analyze_planet: "actions.analyzePlanet",
  delete_planet: "actions.deletePlanet",
  dispense: "actions.dispense",
  play_arcade: "actions.playArcade",
  listen_jukebox: "actions.listen_jukebox",
  check_jukebox: "actions.check_jukebox",
  consume: "actions.consume",
  hide: "actions.hide",
  search: "actions.search",
  snoop: "actions.snoop",
  check_spores: "actions.check_spores",
  dispense_drug: "actions.dispense_drug",
  cook: "actions.cook",
  express_cook: "actions.expressCook",
  hyperfreeze: "actions.hyperfreeze",
  build: "actions.build",
  jettison: "actions.jettison",
  install: "actions.install",
  uninstall: "actions.uninstall",
  examine: "actions.examine",
  caress: "actions.caress",
  mush_caress: "actions.mushCaress",
  bond: "actions.bond",
  dtt: "actions.dtt",
  stt: "actions.stt",
  extract_spore: "actions.extractSpore",
  spike: "actions.spike",
  body_transfer: "actions.bodyTransfer",
  reset_skills: "actions.resetSkills",
  mass_mouldering: "actions.massMouldering",
  demoralize: "actions.demoralize",
  give_disease: "actions.giveDisease",
  trap_room: "actions.trapRoom",
  grow_fairy_ring: "actions.growFairyRing",
  tap_fairy_ring: "actions.tapFairyRing",
  nightmare: "actions.nightmare",
  tube_transfer: "actions.tubeTransfer",
  consume_spore: "actions.consumeSpore",
  fungal_cuisine: "actions.fungalCuisine",
  lie_down: "actions.lieDown",
  report_fire: "actions.reportFire",
  report_equipment: "actions.reportEquipment",
  report_door: "actions.reportDoor",
  get_up: "actions.getUp",
  guard: "actions.guard",
  stop_guarding: "actions.stopGuarding",
  enter_nimble: "actions.enterNimble",
  exit_nimble: "actions.exitNimble",
  become_ninja: "actions.becomeNinja",
  delog: "actions.delog",
  radio_piracy: "actions.radioPiracy",
  radio_piracy_room: "actions.radioPiracy",
  factory_reset: "actions.factoryReset",
  become_normal: "actions.becomeNormal",
  accommodate: "actions.accommodate",
  accept_accommodation: "actions.acceptAccommodation",
  stop_accommodation: "actions.stopAccommodation",
  shower: "actions.shower",
  heal: "actions.heal",
  surgery: "actions.surgery",
  use_bandage: "actions.useBandage",
  remove_spore: "actions.removeSpore",
  vaccinate: "actions.vaccinate",
  punch: "actions.punch",
  throw_out: "actions.throwOut",
  interrogate: "actions.interrogate",
  chitchat: "actions.chitchat",
  premonition: "actions.premonition",
  comfort: "actions.comfort",
  anathema: "actions.anathema",
  protect: "actions.protect",
  coup: "actions.coup",
  issue_mission: "actions.issueMission",
  swap_character: "actions.swapCharacter",
  fiery_speech: "actions.fierySpeech",
  boring_speech: "actions.boringSpeech",
  attack: "actions.attack",
  pick_skill: "actions.pickSkill",
  apprenticeship: "actions.apprenticeship",
  become_genius: "actions.becomeGenius",
  ceasefire: "actions.ceasefire",
  read_book: "actions.readBook",
  tear: "actions.tear",
  print_list: "actions.printList",
  warp_to_planet: "actions.warpToPlanet",
  water: "actions.water",
  treat: "actions.treat",
  sow: "actions.sow",
  graft: "actions.graft",
  claim_slot: "actions.claimSlot",
  withdraw_slot: "actions.withdrawSlot",
  mark_done: "actions.markDone",
  cancel_plan: "actions.cancelPlan",
  summon: "actions.summon",
} as const satisfies Record<Exclude<ActionType, "ready">, string>;

export function useNames() {
  const { t, i18n } = useTranslation();
  // Dynamic keys, so the id falls back to itself when a catalog lacks it.
  const lookup = (group: "rooms" | "equipment" | "items", id: string): string => t(`${group}.${id}` as never, { defaultValue: id });
  // A member lost on a planet is in a place of their own (`lostPlace`), all named alike.
  const room = (id: RoomId) => lookup("rooms", isLostPlace(id) ? LOST_PLACE_NAME : id);
  const skill = (id: string) => t(`skills.names.${id}` as never, { defaultValue: id });
  const equipment = (type: string) => lookup("equipment", type);
  /** What a blueprint builds. */
  const built = (builds: string) => {
    const makes = BLUEPRINTS[builds]?.makes;
    return makes && "item" in makes ? lookup("items", makes.item) : lookup("equipment", makes ? makes.equipment : builds);
  };
  /** A blueprint is named for what it builds; a graft hybrid (#438) for its two parents, lower-numbered first. */
  const item = (type: string, builds?: string) => {
    const parents = hybridParents(type);
    if (parents) return t("items.hybridOf" as never, { a: lookup("items", parents[0]), b: lookup("items", parents[1]), defaultValue: type });
    if (builds === undefined) return lookup("items", type);
    const thing = built(builds);
    return t("items.blueprintOf" as never, { thing, defaultValue: type });
  };
  /** An item as the view has it: a blueprint is named for what it builds, a skill book for its skill, a planted hydropot for its plant. */
  const itemOf = (it: Pick<ItemView, "type" | "builds" | "teaches" | "plant">) =>
    it.plant !== undefined
      ? t("itemAttr.plantOf", { item: item(it.plant.species) })
      : it.teaches === undefined
        ? item(it.type, it.builds)
        : t("items.bookOf" as never, { skill: skill(it.teaches), defaultValue: it.type });
  /** The short label along an item's face: a skill book's skill, a blueprint's product. */
  const itemLabel = (it: Pick<ItemView, "builds" | "teaches">) =>
    it.teaches !== undefined ? skill(it.teaches) : it.builds !== undefined ? built(it.builds) : undefined;
  /** A support drone's name with its serial (#411): "Robbie #42". The name is a proper name and isn't translated. */
  const drone = (name: string, serial: number) => t("itemAttr.droneName", { name, serial });
  /** A drone upgrade id (shared/src/drones.ts, #412): "Firefighter". */
  const droneUpgrade = (id: string) => t(`drones.upgrades.${id}` as never, { defaultValue: id });
  /** A character's favourite song on the jukebox (#477): "Night Flowers by Rob Vivan". */
  const jukeboxSong = (character: string) => t(`jukebox.songs.${character}` as never, { defaultValue: character });
  /** A hostile NPC's kind (shared/src/hostiles.ts), with its article, lowercase: "the intruder". */
  const hostile = (kind: string) => t(`hostiles.kinds.${kind}` as never, { defaultValue: kind });
  /** A hostile NPC's kind as a name on its own, for a heading: "Intruder". */
  const hostileName = (kind: string) => t(`hostiles.names.${kind}` as never, { defaultValue: kind });
  const research = (id: string): string => t(`research.names.${id}` as never, { defaultValue: id });
  const project = (id: string): string => t(`projects.names.${id}` as never, { defaultValue: id });
  const title = (id: string) => t(`titles.names.${id}` as never, { defaultValue: id });
  const rebelBase = (id: string) => t(`comms.rebels.${id}.name` as never, { defaultValue: id });
  const action = (type: string) => {
    const key = (ACTION_NAME_KEYS as Partial<Record<string, string>>)[type];
    return key ? t(key as never, { defaultValue: type }) : type;
  };

  const sampleCounts = (list: string) =>
    new Intl.ListFormat(i18n.language, { type: "unit" }).format(
      list.split(",").map((entry) => {
        const [character = "", count = "0"] = entry.split(":");
        return t("logEvent.sampleCount" as never, { name: characterGivenName(character), count: Number(count) });
      }),
    );

  /** The text of a log entry. `room`, `item`, `research`, `project`, `equipment`, `action`, `title`, `skill`, `status`, `base` (a rebel base), `direction` (a heading), `entry` (a Xyloph entry), `cause` (a cause of death) and `song`/`song1`..`song3` (a jukebox song, by character) params are ids and get translated; `drone` and `serial` make a drone's name, and `upgrade` is a drone upgrade, `hostile` a hostile NPC's kind; `name`, `target` and `body` are character ids; `tested` and `spoiledBy` are an assay's counts by character. */
  const logLine = ({ key, params = {}, maskedActor }: Pick<LogEntry, "key" | "params" | "maskedActor">): string => {
    if (key === DELOGGED_KEY && maskedActor) {
      return t("logEvent.deloggedRevealed", { name: characterGivenName(maskedActor) });
    }
    const resolved: Record<string, string | number> = { ...params };
    if (typeof params.room === "string") resolved.room = room(params.room);
    if (typeof params.item === "string") resolved.item = item(params.item);
    if (typeof params.research === "string") resolved.research = research(params.research);
    if (typeof params.project === "string") resolved.project = project(params.project);
    if (typeof params.equipment === "string") resolved.equipment = equipment(params.equipment);
    if (typeof params.action === "string") resolved.action = action(params.action);
    if (typeof params.title === "string") resolved.title = title(params.title);
    if (typeof params.skill === "string") resolved.skill = skill(params.skill);
    if (typeof params.status === "string") resolved.status = t(`status.${params.status}` as never, { defaultValue: params.status });
    if (typeof params.base === "string") resolved.base = rebelBase(params.base);
    if (typeof params.merchant === "string") resolved.merchant = t(`comms.merchants.kinds.${params.merchant}` as never, { defaultValue: params.merchant });
    if (typeof params.direction === "string") resolved.direction = t(`astro.directions.${params.direction}` as never, { defaultValue: params.direction });
    // A drone's `drone` (its name) and `serial` (shared/src/drones.ts) come together as one name.
    if (typeof params.drone === "string" && typeof params.serial === "number") resolved.drone = drone(params.drone, params.serial);
    if (typeof params.upgrade === "string") resolved.upgrade = droneUpgrade(params.upgrade);
    // Schrödinger's name defaults to the localized item name unless renamed (`params.cat`).
    if (typeof params.cat !== "string") resolved.cat = lookup("items", "body_cat");
    // A hostile NPC's kind (shared/src/hostiles.ts), with its article: "the intruder".
    if (typeof params.hostile === "string") resolved.hostile = hostile(params.hostile);
    if (typeof params.entry === "string") resolved.entry = t(`comms.xyloph.${params.entry}` as never, { defaultValue: params.entry });
    // A cause of death (shared/src/death.ts, #177).
    if (typeof params.cause === "string") resolved.cause = t(`deathCause.${params.cause}` as never, { defaultValue: params.cause });
    // The jukebox's songs (shared/src/jukebox.ts), by the character whose favourite each is.
    for (const song of ["song", "song1", "song2", "song3"] as const) if (typeof params[song] === "string") resolved[song] = jukeboxSong(params[song]);
    // A ninja's name is `SOMEONE` (shared/src/log.ts): "someone", capitalized when the line starts with it.
    // All-seeing replays also carry `maskedActor`, shown as "someone (Chao)" (#486).
    const maskedLabel = maskedActor ? t("logEvent.someoneRevealed", { name: characterGivenName(maskedActor) }) : t("logEvent.someone");
    for (const who of ["name", "target", "body"] as const)
      if (typeof params[who] === "string") resolved[who] = params[who] === SOMEONE ? maskedLabel : characterGivenName(params[who]);
    // An assay's "chun:3,paola:1" lists (shared/src/actions/research.ts): "Chun ×3, Paola ×1".
    for (const list of ["tested", "spoiledBy"] as const) if (typeof params[list] === "string") resolved[list] = sampleCounts(params[list]);
    const line: string = t(`logEvent.${key}` as never, { ...resolved, defaultValue: key });
    // A line may start with a lowercase name: "someone", or a hostile's "the intruder".
    return Object.values(params).includes(SOMEONE) || typeof params.hostile === "string" ? line.charAt(0).toLocaleUpperCase() + line.slice(1) : line;
  };

  return { room, equipment, item, built, itemOf, itemLabel, drone, droneUpgrade, hostile, hostileName, jukeboxSong, research, project, skill, title, rebelBase, action, character: characterName, characterGiven: characterGivenName, logLine };
}
