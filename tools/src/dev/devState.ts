// `npm run dev-state`: read the local dev server's game state, read-only.
//
// Wrangler keeps each Durable Object in its own SQLite file under
// server/.wrangler/state/v3/do/mush2-server-GameRoom/ (per checkout, so a
// worktree reads its own games). Values in the `_cf_KV` table are
// v8-serialized; the game room stores its `StoredRoom` (server/src/GameRoom.ts)
// under the key `game`, with the rules state one level down at `.game`.
//
// This prints everyone's hidden information (roles, private stats). It is for
// debugging only: never paste its output into a bot prompt, an issue or a commit.
//
//   npm run dev-state                      summary of the most recently written game
//   npm run dev-state -- --list            recent games, newest first
//   npm run dev-state -- --room <id>       pick a game by a prefix of its room name or file hash
//   npm run dev-state -- --path players.0  print part of the rules state as JSON
//   npm run dev-state -- --key setup       print any stored key (setup, input:000000012, ...)

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { deserialize } from "node:v8";
import type { GameState } from "@mush2/shared";

const DO_DIR = resolve(import.meta.dirname, "../../../server/.wrangler/state/v3/do/mush2-server-GameRoom");
const LIST_LIMIT = 15;

/** The parts of `StoredRoom` this tool reads. */
interface Stored {
  version?: number;
  game: Omit<GameState, "config">;
  accounts?: Record<string, string>;
  singlePlayer?: boolean;
  language?: string;
}

interface GameFile {
  file: string;
  hash: string;
  mtime: number;
  db?: DatabaseSync;
  name?: string;
}

const { values } = parseArgs({
  options: {
    list: { type: "boolean" },
    room: { type: "string" },
    path: { type: "string" },
    key: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log("Usage: npm run dev-state -- [--list] [--room <id>] [--path <a.b.0>] [--key <storage key>]");
  process.exit(0);
}

const games = listGames();
if (games.length === 0) fail(`No game rooms in ${DO_DIR}. Has \`npm run dev\` run in this checkout?`);

if (values.list) {
  for (const g of games.slice(0, LIST_LIMIT)) {
    const stored = read<Stored>(g, "game");
    const age = Math.round((Date.now() - g.mtime) / 60000);
    const desc = stored
      ? `cycle ${stored.game.cycle} ${stored.game.phase}${stored.singlePlayer ? " single" : ""}, humans ${Object.keys(stored.accounts ?? {}).join(",") || "-"}`
      : "no game (retired or empty)";
    console.log(`${roomName(g)}  ${g.hash.slice(0, 8)}  ${age}m ago  ${desc}`);
  }
  process.exit(0);
}

const game = pick(games, values.room);

if (values.key) {
  print(read(game, values.key) ?? fail(`No key "${values.key}" in ${roomName(game)}.`));
  process.exit(0);
}

const stored = read<Stored>(game, "game") ?? fail(`Room ${roomName(game)} has no game (retired or empty). Try --list.`);

if (values.path) {
  let node: unknown = stored.game;
  for (const part of values.path.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) fail(`No "${part}" in --path ${values.path}.`);
    node = (node as Record<string, unknown>)[part];
  }
  print(node);
  process.exit(0);
}

summary(game, stored);

function summary(file: GameFile, s: Stored): void {
  const g = s.game;
  const setup = read<{ config?: { cyclesPerDay?: number } }>(file, "setup");
  const perDay = setup?.config?.cyclesPerDay ?? 8;
  const day = Math.floor((g.cycle - 1) / perDay) + 1;
  const humans = s.accounts ?? {};
  const out: string[] = [];
  out.push(`room ${roomName(file)} (${file.hash.slice(0, 8)}, written ${Math.round((Date.now() - file.mtime) / 60000)}m ago)`);
  out.push(
    `version ${s.version ?? "?"}, ${s.singlePlayer ? "single player" : "multiplayer"}, ${s.language ?? "?"}; ` +
      `cycle ${g.cycle} (day ${day}, cycle ${((g.cycle - 1) % perDay) + 1} of the day), phase ${g.phase}${g.preselection ? " (pre-selection)" : ""}` +
      (g.winner ? `, winner ${JSON.stringify(g.winner)}` : ""),
  );
  for (const p of g.players) {
    if (!(p.id in humans)) continue;
    const cheats = p.cheats?.length ? p.cheats.join(",") : "none";
    out.push(
      `human ${p.id} ${p.character} (${p.role}${p.alive ? "" : ", dead"}) in ${p.room}: ap ${p.ap}/${p.maxAp} mp ${p.mp}/${p.maxMp} hp ${p.hp}/${p.maxHp} morale ${p.morale}/${p.maxMorale}`,
    );
    if (p.statuses.length) out.push(`  statuses ${JSON.stringify(p.statuses)}`);
    out.push(`  cheats ${cheats}`);
  }
  const roles = g.players.map((p) => `${p.id}:${p.character}${p.role === "mush" ? "*" : ""}${p.alive ? "" : "†"}@${p.room}`);
  out.push(`crew (* mush, † dead) ${roles.join(" ")}`);
  out.push(`titles ${JSON.stringify(g.titles)}`);
  out.push(`ship ${JSON.stringify(g.ship)}`);
  out.push(`navigation ${JSON.stringify(g.navigation)}`);
  const broken = Object.values(g.equipment)
    .flat()
    .filter((e) => e.broken)
    .map((e) => e.id);
  out.push(`broken equipment ${broken.length ? broken.join(" ") : "none"}`);
  out.push(`fires ${g.fires.length ? g.fires.join(" ") : "none"}; hunters ${g.hunters.list.length}`);
  if (g.expedition) out.push(`expedition ${JSON.stringify(g.expedition)}`);
  out.push(`more: --path <a.b.0> (keys: ${Object.keys(g).join(" ")})`);
  console.log(out.join("\n"));
}

function listGames(): GameFile[] {
  let names: string[];
  try {
    names = readdirSync(DO_DIR);
  } catch {
    return [];
  }
  const set = new Set(names);
  // Opening a database read-only still leaves an empty -wal file behind, so an empty one says nothing about writes.
  const mtime = (f: string) => {
    if (!set.has(f)) return 0;
    const st = statSync(join(DO_DIR, f));
    return st.size > 0 ? st.mtimeMs : 0;
  };
  return names
    .filter((f) => /^[0-9a-f]{64}\.sqlite$/.test(f))
    .map((f) => ({ f, t: Math.max(mtime(f), mtime(`${f}-wal`)) }))
    .sort((a, b) => b.t - a.t)
    .map(({ f, t }) => ({ file: f, hash: f.slice(0, 64), mtime: t }));
}

/** Opened only when needed: there can be hundreds of rooms. */
function open(g: GameFile): DatabaseSync {
  g.db ??= new DatabaseSync(join(DO_DIR, g.file), { readOnly: true });
  return g.db;
}

/** The room's name as PartyServer gave it (what the client's URL and the matchmaker use). */
function roomName(g: GameFile): string {
  g.name ??= tryQuery(() => (open(g).prepare("SELECT name FROM __miniflare_do_name LIMIT 1").get() as { name?: string } | undefined)?.name) ?? "?";
  return g.name;
}

function tryQuery<T>(query: () => T): T | undefined {
  try {
    return query();
  } catch {
    return undefined; // A room that never stored anything has no tables.
  }
}

/** The newest game with a `game` key, or the one named by `--room` (a prefix of the room name or file hash). */
function pick(all: GameFile[], room: string | undefined): GameFile {
  if (room) {
    const found = all.find((g) => roomName(g).startsWith(room) || g.hash.startsWith(room));
    return found ?? fail(`No room "${room}". Try --list.`);
  }
  return all.find((g) => read(g, "game") !== undefined) ?? fail("No room holds a game. Try --list.");
}

function read<T = unknown>(g: GameFile, key: string): T | undefined {
  const row = tryQuery(() => open(g).prepare("SELECT value FROM _cf_KV WHERE key = ?").get(key) as { value: Uint8Array } | undefined);
  return row ? (deserialize(Buffer.from(row.value)) as T) : undefined;
}

function print(value: unknown): void {
  const json = JSON.stringify(value, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v), 2);
  console.log(json ?? String(value));
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
