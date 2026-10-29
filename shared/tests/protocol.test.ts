import { describe, expect, it } from "vitest";
import type { ActionOf, ActionType } from "../src/actions.ts";
import { BIOS_OPTIONS } from "../src/bios.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { MUSH_SKILLS, SKILLS } from "../src/skills.ts";

const parse = (msg: unknown) => parseGameMessage(JSON.stringify(msg));

describe("model key messages (BYOK)", () => {
  const ok = { type: "setModel", provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", apiKey: "sk-or-v1-abc123" };

  it("parses setModel and clearModel, dropping anything extra", () => {
    expect(parse({ ...ok, baseUrl: "https://evil.test" })).toEqual(ok);
    expect(parse({ type: "clearModel", apiKey: "x" })).toEqual({ type: "clearModel" });
  });

  it("refuses providers off the allowlist, and keys or model names that could break the request", () => {
    expect(parse({ ...ok, provider: "https://evil.test/v1" })).toBeNull();
    expect(parse({ ...ok, apiKey: "" })).toBeNull();
    expect(parse({ ...ok, apiKey: "sk-1\r\nx-evil: 1" })).toBeNull();
    expect(parse({ ...ok, apiKey: "a".repeat(513) })).toBeNull();
    expect(parse({ ...ok, model: "" })).toBeNull();
    expect(parse({ ...ok, model: 'm", "max_tokens": 99999' })).toBeNull();
    expect(parse({ ...ok, model: 3 })).toBeNull();
  });
});

describe("actions from a client", () => {
  // One of each shape. The type makes it list every action type, so a new action can't be left out.
  const SAMPLES: { [K in ActionType]: ActionOf<K>[] } = {
    ready: [{ type: "ready" }],
    move: [{ type: "move", to: "bridge" }],
    take: [{ type: "take", item: "i1" }],
    drop: [{ type: "drop", item: "i1" }],
    dismantle: [{ type: "dismantle", item: "i1" }, { type: "dismantle", equipment: "e1" }],
    access: [{ type: "access", equipment: "e1" }],
    research: [{ type: "research", equipment: "e1", research: "r1" }],
    project: [{ type: "project", equipment: "e1", project: "p1" }],
    repair_pilgred: [{ type: "repair_pilgred", equipment: "e1" }],
    return_to_sol: [{ type: "return_to_sol", equipment: "e1" }],
    turn_ship: [{ type: "turn_ship", equipment: "e1", side: "left" }],
    travel: [{ type: "travel", equipment: "e1" }],
    leave_orbit: [{ type: "leave_orbit", equipment: "e1" }],
    take_fuel: [{ type: "take_fuel", equipment: "e1" }],
    load_fuel: [{ type: "load_fuel", equipment: "e1" }],
    unload_fuel: [{ type: "unload_fuel", equipment: "e1" }],
    return_fuel: [{ type: "return_fuel", equipment: "e1" }],
    take_oxygen: [{ type: "take_oxygen", equipment: "e1" }],
    return_oxygen: [{ type: "return_oxygen", equipment: "e1" }],
    check_combustion: [{ type: "check_combustion", equipment: "e1" }],
    contact_sol: [{ type: "contact_sol", equipment: "e1" }],
    decode_rebel: [{ type: "decode_rebel", equipment: "e1", base: "b1" }],
    contact_xyloph: [{ type: "contact_xyloph", equipment: "e1" }],
    update_neron: [{ type: "update_neron", equipment: "e1" }],
    set_bios: [{ type: "set_bios", equipment: "e1", option: BIOS_OPTIONS[0]!, value: true }],
    scan_planet: [{ type: "scan_planet", equipment: "e1" }],
    analyze_planet: [{ type: "analyze_planet", equipment: "e1", planet: "pl1" }],
    delete_planet: [{ type: "delete_planet", equipment: "e1", planet: "pl1" }],
    turret_attack: [{ type: "turret_attack", equipment: "e1", hunter: "h1" }],
    patrol_attack: [{ type: "patrol_attack", equipment: "e1", hunter: "h1" }],
    repair_hull: [{ type: "repair_hull", item: "i1" }],
    takeoff: [{ type: "takeoff", equipment: "e1" }],
    land: [{ type: "land", equipment: "e1" }],
    collect_scrap: [{ type: "collect_scrap", equipment: "e1" }],
    open_capsule: [{ type: "open_capsule", item: "i1" }],
    dispense: [{ type: "dispense", equipment: "e1" }],
    consume: [{ type: "consume", item: "i1" }],
    hide: [{ type: "hide", item: "i1" }],
    search: [{ type: "search" }],
    cook: [{ type: "cook", item: "i1" }],
    express_cook: [{ type: "express_cook", item: "i1" }],
    water: [{ type: "water", item: "i1" }],
    treat: [{ type: "treat", item: "i1" }],
    sow: [{ type: "sow", item: "i1", fruit: "i2" }],
    build: [{ type: "build", item: "i1" }],
    jettison: [{ type: "jettison", item: "i1" }],
    install: [{ type: "install", item: "i1" }],
    uninstall: [{ type: "uninstall", equipment: "e1" }],
    examine: [{ type: "examine", target: { kind: "player", id: "p1" } }, { type: "examine", target: { kind: "equipment", id: "e1" } }, { type: "examine", target: { kind: "item", id: "i1" } }],
    bond: [{ type: "bond", target: "p1" }],
    dtt: [{ type: "dtt", target: "p1" }],
    stt: [{ type: "stt", target: "p1" }],
    extract_spore: [{ type: "extract_spore" }],
    spike: [{ type: "spike", target: "p1" }],
    fungal_cuisine: [{ type: "fungal_cuisine", item: "i1" }],
    body_transfer: [{ type: "body_transfer", target: "p1" }],
    lie_down: [{ type: "lie_down", equipment: "e1" }],
    get_up: [{ type: "get_up" }],
    accommodate: [{ type: "accommodate", target: "p1" }],
    accept_accommodation: [{ type: "accept_accommodation", target: "p1" }],
    stop_accommodation: [{ type: "stop_accommodation", target: "p1" }],
    shower: [{ type: "shower", equipment: "e1" }],
    heal: [{ type: "heal", target: "p1" }],
    vaccinate: [{ type: "vaccinate", target: "p1" }],
    punch: [{ type: "punch", target: "p1" }],
    interrogate: [{ type: "interrogate", target: "p1" }],
    chitchat: [{ type: "chitchat", target: "p1" }],
    comfort: [{ type: "comfort", target: "p1" }],
    anathema: [{ type: "anathema", target: "p1" }],
    fiery_speech: [{ type: "fiery_speech" }],
    boring_speech: [{ type: "boring_speech" }],
    attack: [{ type: "attack", weapon: "i1", target: "p1" }, { type: "attack", weapon: "i1" }],
    pick_skill: [{ type: "pick_skill", skill: SKILLS[0] }, { type: "pick_skill", skill: MUSH_SKILLS[0] }],
    read_book: [{ type: "read_book", item: "i1" }],
    self_disease: [{ type: "self_disease" }],
    self_injury: [{ type: "self_injury" }],
  };
  const all = Object.values(SAMPLES).flat();
  const asAction = (action: unknown) => parse({ type: "action", action });

  it.each(all.map((a) => [a.type, a] as const))("parses %s back to itself", (_type, action) => {
    expect(asAction(action)).toEqual({ type: "action", action });
  });

  it("strips fields the action doesn't have, at every level", () => {
    for (const action of all) {
      const extra = { ...action, extra: 1, __proto__: { polluted: 1 }, ...("target" in action && typeof action.target === "object" ? { target: { ...action.target, extra: 1 } } : {}) };
      const parsed = asAction(extra);
      expect(parsed).toEqual({ type: "action", action });
      expect(JSON.stringify(parsed)).toBe(JSON.stringify({ type: "action", action }));
    }
  });

  it("refuses unknown types, prototype keys, and missing or wrongly typed fields", () => {
    for (const type of ["nope", "constructor", "toString", "__proto__", "hasOwnProperty", 3, null]) expect(asAction({ type })).toBeNull();
    expect(asAction(["ready"])).toBeNull();
    for (const action of all) {
      for (const key of Object.keys(action).filter((k) => k !== "type")) {
        // Dismantle takes either field, so it still parses with one of them gone.
        if (action.type === "dismantle") continue;
        const { [key]: _dropped, ...missing } = action as Record<string, unknown>;
        if (!(action.type === "attack" && key === "target")) expect(asAction(missing), `${action.type} without ${key}`).toBeNull();
        expect(asAction({ ...action, [key]: 7 }), `${action.type} with a numeric ${key}`).toBeNull();
      }
    }
    expect(asAction({ type: "dismantle" })).toBeNull();
    expect(asAction({ type: "turn_ship", equipment: "e1", side: "up" })).toBeNull();
    expect(asAction({ type: "set_bios", equipment: "e1", option: "nope", value: true })).toBeNull();
    expect(asAction({ type: "set_bios", equipment: "e1", option: BIOS_OPTIONS[0], value: "true" })).toBeNull();
    expect(asAction({ type: "pick_skill", skill: "nope" })).toBeNull();
    expect(asAction({ type: "examine", target: { kind: "room", id: "bridge" } })).toBeNull();
    expect(asAction({ type: "examine", target: "p1" })).toBeNull();
  });
});
