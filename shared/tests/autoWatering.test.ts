import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, PROJECT_STATUS } from "../src/projects.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { makeSeats, nextCycle, player, setProgress } from "./support.ts";

const HERE = "REFECTORY";
const ELSEWHERE = "MEDLAB";

const globalSystem = (s: Readonly<GameState>) => s.chat.filter((m) => m.channel === "global" && m.system !== undefined).map((m) => m.system);

function ship(autoWatering?: Partial<GameConfig["project"]["autoWatering"]>, fire?: Partial<GameConfig["fire"]>): GameState {
  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    incidents: { ...DEFAULT_CONFIG.incidents, pointsByDay: [], laterAdditionFromDay: 999, majorAdditionFromDay: 999 },
    project: { ...DEFAULT_CONFIG.project, autoWatering: { ...DEFAULT_CONFIG.project.autoWatering, ...autoWatering } },
    fire: { ...DEFAULT_CONFIG.fire, spreadChance: 0, breakChance: 0, hullChance: 0, ...fire },
  };
  const s = createGame(makeSeats(3, "others"), config, 7);
  player(s, "p0").room = HERE;
  player(s, "p2").room = ELSEWHERE;
  return s;
}

describe("Automatic sprinklers (AUTO_WATERING)", () => {
  it("uses the confirmed config values and marks the project full", () => {
    expect(DEFAULT_CONFIG.project.autoWatering).toEqual({ extinguishChance: 0.25 });
    expect(PROJECT_STATUS.AUTO_WATERING).toBe("full");
  });

  it("does nothing before the project is complete", () => {
    const s = ship({ extinguishChance: 1 });
    setProgress(s, { project: "AUTO_WATERING" }, PROJECT_COMPLETE - 1);
    s.fires = [HERE];
    const after = nextCycle(s);
    expect(after.fires).toEqual([HERE]);
    expect(globalSystem(after).filter((m) => m?.key === "fireExtinguishedSprinklers")).toHaveLength(0);
    expect(player(after, "p0").hp).toBe(player(s, "p0").hp - s.config.fire.damage);
  });

  it("puts out burning rooms before they spread or deal damage, announced globally without the room", () => {
    const s = ship({ extinguishChance: 1 }, { spreadChance: 1, hullChance: 1 });
    setProgress(s, { project: "AUTO_WATERING" }, PROJECT_COMPLETE);
    s.fires = [HERE, "CORRIDOR_A"];
    s.reports.fires.push({ room: HERE, by: "chao" });

    const after = nextCycle(s);
    expect(after.fires).toEqual([]);
    expect(after.reports.fires).toEqual([]);
    expect(player(after, "p0").hp).toBe(player(s, "p0").hp);
    expect(after.ship.hull).toBe(s.ship.hull);
    const messages = globalSystem(after).filter((m) => m?.key === "fireExtinguishedSprinklers");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ key: "fireExtinguishedSprinklers" });
    expect(JSON.stringify(viewFor(after, "p2").chat)).not.toContain(HERE);
    expect(JSON.stringify(viewFor(after, "p2").chat)).not.toContain("CORRIDOR_A");
  });

  it("also rolls on fires that started in the same cycle", () => {
    const s = ship({ extinguishChance: 1 });
    setProgress(s, { project: "AUTO_WATERING" }, PROJECT_COMPLETE);
    s.pendingFires = [HERE];

    const after = nextCycle(s);
    expect(after.fires).toEqual([]);
    expect(globalSystem(after)).toContainEqual({ key: "fireStarted" });
    expect(globalSystem(after)).toContainEqual({ key: "fireExtinguishedSprinklers" });
    expect(player(after, "p0").hp).toBe(player(s, "p0").hp);
  });

  it("leaves fires burning when the sprinkler roll misses", () => {
    const s = ship({ extinguishChance: 0 });
    setProgress(s, { project: "AUTO_WATERING" }, PROJECT_COMPLETE);
    s.fires = [HERE];

    const after = nextCycle(s);
    expect(after.fires).toEqual([HERE]);
    expect(globalSystem(after).filter((m) => m?.key === "fireExtinguishedSprinklers")).toHaveLength(0);
    expect(player(after, "p0").hp).toBe(player(s, "p0").hp - s.config.fire.damage);
  });
});
