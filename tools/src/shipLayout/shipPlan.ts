// Mush/src/common/data/Map.hx -> ship-plan.json, the top-down deck plan for
// the minimap. The original built it from a color-coded image (shipMap_s1.png)
// that isn't in the archive, but Map.hx keeps the result as a serialized
// string (`s1Cache`), so we read that instead.

import type { CellRun, ShipPlan } from "@mush2/shared";
import { unserialize, type HaxeCustom, type HaxeEnum } from "./haxe.ts";

interface V2I {
  x: number;
  y: number;
}

interface Cached {
  graphic: {
    roomPosList: HaxeCustom;
    wallList: V2I[];
    doorList: Record<number, { posList: V2I[]; roomList: HaxeEnum[] }>;
  };
}

/** The serialized plan in Map.hx: the `#if neko` branch of `s1Cache`. */
export function cachedPlan(mapHx: string): string {
  const m = /s1Cache\s*=\s*#if neko\s*"([^"]*)"/.exec(mapHx) ?? fail("Map.hx: no s1Cache string");
  return m[1]!;
}

/**
 * @param roomIds the RoomId enum in order, so enum indices map to ids.
 */
export function convertShipPlan(serialized: string, roomIds: readonly string[]): ShipPlan {
  const data = unserialize(serialized) as Cached;
  const { roomPosList, wallList, doorList } = data.graphic;
  // EnumHash.hxSerialize writes the enum's name, then an IntHash keyed by enum index.
  const [enumName, byIndex] = roomPosList.parts as [string, Record<number, { posList: V2I[] }>];
  if (enumName !== "_RoomId") fail(`roomPosList is keyed by ${enumName}`);
  const roomId = (index: number) => roomIds[index] ?? fail(`unknown room index ${index}`);

  const all = [...wallList, ...Object.values(byIndex).flatMap((r) => r.posList)];
  const minX = Math.min(...all.map((c) => c.x));
  const minY = Math.min(...all.map((c) => c.y));
  const shift = (cells: V2I[]) => cells.map((c) => ({ x: c.x - minX, y: c.y - minY }));
  const shifted = shift(all);

  const rooms = Object.entries(byIndex).map(([index, r]) => ({ id: roomId(Number(index)), runs: runs(shift(r.posList)) }));
  const doors = Object.values(doorList).map((d) => {
    if (d.roomList.length !== 2) fail(`door joins ${d.roomList.length} rooms`);
    const [a, b] = d.roomList.map((e) => roomId(e.index)) as [string, string];
    return {
      rooms: (a < b ? [a, b] : [b, a]) as [string, string],
      cells: shift(d.posList).map((c) => [c.x, c.y] as [number, number]),
    };
  });
  doors.sort((d, e) => d.rooms.join().localeCompare(e.rooms.join()) || d.cells[0]![1] - e.cells[0]![1] || d.cells[0]![0] - e.cells[0]![0]);
  return {
    width: Math.max(...shifted.map((c) => c.x)) + 1,
    height: Math.max(...shifted.map((c) => c.y)) + 1,
    rooms,
    doors,
    walls: runs(shift(wallList)),
  };
}

/** Packs cells into horizontal runs, top to bottom, left to right. */
export function runs(cells: V2I[]): CellRun[] {
  const sorted = [...new Map(cells.map((c) => [`${c.x},${c.y}`, c])).values()].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: CellRun[] = [];
  for (const c of sorted) {
    const last = out.at(-1);
    if (last && last[1] === c.y && last[0] + last[2] === c.x) last[2]++;
    else out.push([c.x, c.y, 1]);
  }
  return out;
}

/** One room, door, or wall row per line. */
export function formatShipPlan(plan: ShipPlan): string {
  const list = (items: unknown[]) => `[\n${items.map((i) => `    ${JSON.stringify(i)}`).join(",\n")}\n  ]`;
  return `{\n  "width": ${plan.width},\n  "height": ${plan.height},\n  "rooms": ${list(plan.rooms)},\n  "doors": ${list(plan.doors)},\n  "walls": ${JSON.stringify(plan.walls)}\n}\n`;
}

function fail(message: string): never {
  throw new Error(`ship-plan: ${message}`);
}
