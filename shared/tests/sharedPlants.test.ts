import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { dayOf } from "../src/helpers.ts";
import { ITRACKIE_ITEM, TREE_POT_ITEM } from "../src/items.ts";
import { normalizePlant } from "../src/normalizeState.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor, type ActionResult } from "../src/rules.ts";
import {
  MAX_SHARED_PLANT_EFFECTS_LENGTH,
  MAX_SHARED_PLANT_SICK_CYCLES,
  MAX_SHARED_PLANT_TEXT_LENGTH,
  MAX_SHARED_PLANTS,
  sharePlants,
} from "../src/sharedPlants.ts";
import type { GameState, SharedPlantRow } from "../src/types.ts";
import { clone, makeSeats, must, nextCycle, offered, player } from "./support.ts";

const seats = makeSeats(4, "others");
const GARDEN = DEFAULT_CONFIG.botany.gardenRoom;
const CONTROLLER = `${GARDEN}:PLANT_CONTROLLER`;

const error = (r: ActionResult): string => {
  if (r.ok) throw new Error("expected a failure");
  return r.error;
};

/** Everyone in the greenhouse, by the Hydroponics center; p0 is a Botanist, p1 is a non-Botanist human, p2 is Mush. */
function game(): GameState {
  const s = createGame(seats, structuredClone(DEFAULT_CONFIG), 7);
  for (const p of s.players) {
    p.room = GARDEN;
    p.role = "human";
  }
  player(s, "p0").skills = ["botanic"];
  player(s, "p2").role = "mush";
  player(s, "p3").skills = ["skilful"];
  return s;
}

const ROW: SharedPlantRow = {
  species: "fruit_banana",
  effects: "+1 AP\n+1 Satiety",
  thirst: 1,
  sickCycles: 3,
  young: false,
};

describe("Hydroponics center terminal and plant sickCycles", () => {
  it("exposes PLANT_CONTROLLER as an accessible terminal in the greenhouse", () => {
    const s = game();
    expect(offered(s, "p1").some((a) => a.type === "access" && a.equipment === CONTROLLER)).toBe(true);
    expect(applyAction(s, "p1", { type: "access", equipment: CONTROLLER }).ok).toBe(true);
  });

  it("tracks sickCycles while sick, clears on treat, and hides sickCycles from non-botanists", () => {
    let s = game();
    s.config.botany.sickChancePerCycle = 1;
    const pot = s.items.find((i) => i.type === TREE_POT_ITEM && i.plant && i.at.kind === "room" && i.at.id === GARDEN)!;
    pot.plant!.sick = false;
    delete pot.plant!.sickCycles;

    s = nextCycle(s);
    const after1 = s.items.find((i) => i.id === pot.id)!.plant!;
    expect(after1.sick).toBe(true);
    expect(after1.sickCycles).toBe(1);

    s = nextCycle(s);
    const after2 = s.items.find((i) => i.id === pot.id)!.plant!;
    expect(after2.sick).toBe(true);
    expect(after2.sickCycles).toBe(2);

    // Botanist and Skilful see sick + sickCycles; ordinary human and non-Botanist Mush do not.
    const botView = viewFor(s, "p0").roomItems.find((i) => i.id === pot.id)!.plant!;
    const skilfulView = viewFor(s, "p3").roomItems.find((i) => i.id === pot.id)!.plant!;
    const humanView = viewFor(s, "p1").roomItems.find((i) => i.id === pot.id)!.plant!;
    const mushView = viewFor(s, "p2").roomItems.find((i) => i.id === pot.id)!.plant!;
    expect(botView.sick).toBe(true);
    expect(botView.sickCycles).toBe(2);
    expect(skilfulView.sick).toBe(true);
    expect(skilfulView.sickCycles).toBe(2);
    expect(humanView.sick).toBeUndefined();
    expect(humanView.sickCycles).toBeUndefined();
    expect(mushView.sick).toBeUndefined();
    expect(mushView.sickCycles).toBeUndefined();

    // Treating clears both sick and sickCycles.
    s = must(applyAction(s, "p0", { type: "treat", item: pot.id }));
    const treated = s.items.find((i) => i.id === pot.id)!.plant!;
    expect(treated.sick).toBe(false);
    expect(treated.sickCycles).toBeUndefined();
  });

  it("normalizes older stored plants with sickCycles defaulted to 1 when sick and absent when healthy", () => {
    expect(normalizePlant({ species: "fruit_banana", age: null, thirst: 0, sick: true })).toEqual({
      species: "fruit_banana",
      age: null,
      thirst: 0,
      sick: true,
      sickCycles: 1,
    });
    expect(normalizePlant({ species: "fruit_banana", age: null, thirst: 0, sick: false })).toEqual({
      species: "fruit_banana",
      age: null,
      thirst: 0,
      sick: false,
    });
  });
});

describe("sharing greenhouse plant status", () => {
  it("pins the status for everyone who reads Botany, replaces on update, and posts system messages", () => {
    const before = game();
    const s1 = must(sharePlants(before, "p1", [ROW], "  Water the banana!  "));
    const day = dayOf(s1);
    expect(s1.sharedPlants).toEqual({
      plants: [ROW],
      text: "Water the banana!",
      by: "p1",
      ...day,
    });
    // Free: spends no AP or MP.
    expect(player(s1, "p1").ap).toBe(player(before, "p1").ap);
    expect(player(s1, "p1").mp).toBe(player(before, "p1").mp);
    expect(s1.chat.filter((m) => m.channel === "botany").map((m) => m.system)).toEqual([
      { key: "plantShared", params: { name: player(s1, "p1").character } },
    ]);

    // Visible to living players with an iTrackie, hidden from living players without one, visible to the dead.
    expect(viewFor(s1, "p0").sharedPlants).toEqual(s1.sharedPlants);
    const bare = clone(s1);
    bare.items = bare.items.filter((i) => !(i.type === ITRACKIE_ITEM && i.at.kind === "player" && i.at.id === "p2"));
    expect(viewFor(bare, "p2").sharedPlants).toBeNull();
    expect(viewFor(bare, "p2").canSharePlants).toBe(false);
    const dead = clone(s1);
    player(dead, "p2").alive = false;
    expect(viewFor(dead, "p2").sharedPlants).toEqual(s1.sharedPlants);
    expect(viewFor(dead, "p2").canSharePlants).toBe(false);

    // Sharing again replaces the snapshot (lies and empty note allowed) and logs plantShareUpdated.
    const lie: SharedPlantRow = { species: "fruit01", effects: "+5 AP", thirst: 0, sickCycles: null, young: true };
    const s2 = must(sharePlants(s1, "p2", [lie], ""));
    expect(s2.sharedPlants).toEqual({ plants: [lie], text: "", by: "p2", ...dayOf(s2) });
    expect(s2.chat.filter((m) => m.channel === "botany").map((m) => m.system)).toEqual([
      { key: "plantShared", params: { name: player(s1, "p1").character } },
      { key: "plantShareUpdated", params: { name: player(s2, "p2").character } },
    ]);
  });

  it("refuses illegal shares and leaves state unchanged", () => {
    const s = game();
    const away = clone(s);
    player(away, "p1").room = "BRIDGE";
    expect(error(sharePlants(away, "p1", [ROW], ""))).toBe("share_forbidden");
    expect(viewFor(away, "p1").canSharePlants).toBe(false);

    const broken = clone(s);
    broken.equipment[GARDEN]!.find((e) => e.type === "PLANT_CONTROLLER")!.broken = true;
    expect(error(sharePlants(broken, "p1", [ROW], ""))).toBe("share_forbidden");
    expect(viewFor(broken, "p1").canSharePlants).toBe(false);

    const dead = clone(s);
    player(dead, "p1").alive = false;
    expect(error(sharePlants(dead, "p1", [ROW], ""))).toBe("share_forbidden");

    const bare = clone(s);
    bare.items = bare.items.filter((i) => !(i.type === ITRACKIE_ITEM && i.at.kind === "player" && i.at.id === "p1"));
    expect(error(sharePlants(bare, "p1", [ROW], ""))).toBe("share_forbidden");

    expect(error(sharePlants(s, "p1", [{ ...ROW, species: "medikit" }], ""))).toBe("share_plants_invalid");
    expect(error(sharePlants(s, "p1", [{ ...ROW, thirst: 3 as never }], ""))).toBe("share_plants_invalid");
    expect(error(sharePlants(s, "p1", [{ ...ROW, sickCycles: 0 }], ""))).toBe("share_plants_invalid");
    expect(error(sharePlants(s, "p1", [{ ...ROW, sickCycles: MAX_SHARED_PLANT_SICK_CYCLES + 1 }], ""))).toBe("share_plants_invalid");
    expect(error(sharePlants(s, "p1", [{ ...ROW, effects: "x".repeat(MAX_SHARED_PLANT_EFFECTS_LENGTH + 1) }], ""))).toBe("share_plants_invalid");
    expect(error(sharePlants(s, "p1", Array(MAX_SHARED_PLANTS + 1).fill(ROW), ""))).toBe("share_plants_invalid");
    expect(error(sharePlants(s, "p1", [ROW], "x".repeat(MAX_SHARED_PLANT_TEXT_LENGTH + 1)))).toBe("share_text_invalid");
    expect(s.sharedPlants).toBeNull();
  });

  it("replays from sharePlants input and parses from the wire", () => {
    const replayed = must(applyInput(game(), { type: "sharePlants", plants: [ROW], text: "hi", by: "p1" }));
    expect(replayed.sharedPlants?.plants).toEqual([ROW]);
    expect(replayed.sharedPlants?.text).toBe("hi");

    const parse = (o: unknown) => parseGameMessage(JSON.stringify(o));
    expect(parse({ type: "sharePlants", plants: [{ ...ROW, extra: 1 }], text: "ok" })).toEqual({
      type: "sharePlants",
      plants: [ROW],
      text: "ok",
    });
    expect(parse({ type: "sharePlants", plants: [{ ...ROW, species: "not_a_fruit" }], text: "" })).toBeNull();
    expect(parse({ type: "sharePlants", plants: "nope", text: "" })).toBeNull();
    expect(parse({ type: "sharePlants", plants: [], text: 123 })).toBeNull();
  });
});
