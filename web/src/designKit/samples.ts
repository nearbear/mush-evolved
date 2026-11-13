// The kit's sample views, built once at load through the fixture (sampleView.ts). Each is a real `viewFor` result.
// Dev-only: this page never ships.

import type { EquipmentView, PlayerView } from "@mush2/shared";
import {
  act,
  addHunters,
  breakAll,
  channel,
  bodyTaken,
  ended,
  giveItems,
  givePlanet,
  giveTitle,
  kill,
  lastChannel,
  moveTo,
  moveToEquipment,
  pickSkills,
  queue,
  sampleState,
  sampleView,
  say,
  share,
  spend,
  thread,
} from "./sampleView.ts";

export const humanView = sampleView(spend(giveTitle(pickSkills(sampleState(), ["pilot"]), "commander"), { ap: 3, mp: 1 }));
export const mushView = sampleView(spend(sampleState({ role: "mush", character: "kuanti" }), { ap: 8 }));
export const freshView = sampleView();
// Lethargy doubles max AP to 24, which wraps the gauge into two columns of 12 (apGauge.ts).
export const lethargyView = sampleView(spend(pickSkills(sampleState({ character: "chun" }), ["lethargy"]), { ap: 3 }));
export const preselectionView = sampleView(sampleState({ preselection: true }));

/** Carrying a weapon, a ration and a heavy machine gun (heavy items show their MP penalty). */
export const itemsView = sampleView(giveItems(sampleState(), ["blaster", "cooked_ration", "machine_gun"]));

/** A broken blaster in your hands and a broken coffee machine in your room (breakable types, flag only). */
export const brokenView = sampleView(breakAll(moveToEquipment(giveItems(sampleState(), ["blaster"]), "COFFEE_DISPENSER"), ["blaster", "COFFEE_DISPENSER"]));

/** An action under way and two waiting behind it: three searches queued through the rules. */
export const queueView = (() => {
  return sampleView(queue(sampleState(), [{ type: "search" }, { type: "search" }, { type: "search" }]));
})();

/** A planet found on the Astro terminal, with one sector analysed. */
const FUGUNYS = {
  id: "planet-1",
  name: "Fugunys",
  direction: "north" as const,
  distance: 3,
  sectors: [
    { tag: "OXYGEN" as const, known: true },
    { tag: "FOREST" as const, known: false },
    { tag: "DESERT" as const, known: false },
  ],
};

/** Each terminal, seen by a Pilot commander standing at it (the Astro terminal with a planet to share). */
const atTerminals = givePlanet(giveTitle(pickSkills(sampleState(), ["pilot"]), "commander"), FUGUNYS);
export const TERMINAL_TYPES = ["RESEARCH_LAB", "NERON_CORE", "PILGRED", "ASTRO_MODULE", "PILOT_MODULE", "COM_CENTER", "NERON_BIOS_TERM", "TURRET_COMMAND"] as const;
export const terminalSamples: { view: PlayerView; terminal: EquipmentView }[] = TERMINAL_TYPES.map((type) => {
  const view = sampleView(moveToEquipment(atTerminals, type));
  const terminal = view.roomEquipment.find((e) => e.type === type);
  if (!terminal) throw new Error(`No ${type} in the sample room`);
  return { view, terminal };
});

/** Hunters attacking: six, every kind once and a second plain hunter, at full hp and a little less. */
const HUNTERS = 6;

/** The turret terminal while hunters attack (each hunter's hp and every turret's charges are in the view there). */
export const turretHuntersSample = (() => {
  const view = sampleView(addHunters(moveToEquipment(atTerminals, "TURRET_COMMAND"), HUNTERS, true));
  const terminal = view.roomEquipment.find((e) => e.type === "TURRET_COMMAND");
  if (!terminal) throw new Error("No TURRET_COMMAND in the sample room");
  return { view, terminal };
})();

/** Hua flying a patrol ship out of bay A (a Pilot's takeoff through the rules), alone and with hunters in sight. */
const inFlight = (() => {
  const s = moveTo(pickSkills(sampleState({ character: "hua" }), ["pilot"]), "SPACESHIP_BAY_A");
  return act(s, { type: "takeoff", equipment: "SPACESHIP_BAY_A:PATROL_SHIP_A_0" });
})();
export const patrolView = sampleView(inFlight);
export const patrolHuntersView = sampleView(addHunters(inFlight, HUNTERS, true));

/**
 * The iTrackie's sample: Hua, a Pilot, shares a planet from the Astro terminal, then flies the Icarus to it (so the
 * room log has the expedition line that opens its report). Global chat has a few lines, one with a checklist, a
 * thread grew from the first, and the Botany feature has a line.
 */
export const chatView = (() => {
  let s = moveToEquipment(givePlanet(pickSkills(sampleState({ character: "hua" }), ["pilot"]), FUGUNYS), "ASTRO_MODULE");
  s = share(s, FUGUNYS.id, "Fugunys, north, 3 fuel. Oxygen in one sector; two still unknown.");
  s = say(s, "global", "Morning crew. Who has the **blaster**?");
  s = say(s, "global", "Not me. I'm on the hydroponics.", "p1");
  s = say(s, "global", "Plan for today:\n- [ ] fix the hull\n- [x] water the plants\n- [ ] scan for planets", "p2");
  s = thread(s, "Who has the blaster", 0);
  s = say(s, "botany", "The banana tree is thirsty again.", "p3");
  s = structuredClone(moveTo(s, "ICARUS"));
  s.navigation.orbit = FUGUNYS.id;
  s = act(s, { type: "icarus_takeoff", equipment: "ICARUS:ICARUS_COMMAND" });
  return sampleView(s);
})();

/**
 * Kuan Ti, Mush, talks with the other Mush seat on the Mush channel, and has a private channel with two crewmates
 * (Mush players have private channels like anyone).
 */
export const mushChatView = (() => {
  let s = sampleState({ role: "mush", character: "kuanti" });
  const other = s.players.find((p) => p.role === "mush" && p.id !== "p0");
  if (!other) throw new Error("No second Mush seat");
  s = say(s, "mush", "I'll take the lab tonight. Keep them busy in the kitchen.");
  s = say(s, "mush", "Fine. Who do we spore first?", other.id);
  s = say(s, "mush", "Whoever is still awake at the cycle change.");
  s = channel(s, "Night shift", ["p1", "p2"]);
  const pc = lastChannel(s);
  s = say(s, pc, "Anyone seen who keeps leaving the lab open?");
  s = say(s, pc, "No, but the fuel went down again.", "p1");
  s = say(s, pc, "I'll watch the engine room after dinner.", "p2");
  return sampleView(s);
})();

export const deadView = sampleView(kill(sampleState()));
export const deadMushView = sampleView(kill(sampleState({ role: "mush", character: "kuanti" })));
export const bodyTakenView = sampleView(bodyTaken(sampleState({ character: "eleesha" }), "kuanti"));
export const edenView = sampleView(ended(sampleState(), "humans", "eden"));
export const mushWinView = sampleView(ended(sampleState({ role: "mush", character: "kuanti" }), "mush", "humans_dead"));
