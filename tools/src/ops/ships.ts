// `npm run ships -- --env <production|staging|test>` (#431, docs/ops/observability.md): the ships running now, per
// language and mode, with signed-in players aboard against seats and launch time.
//
// One fixed, read-only query (shipsReport.ts) through `wrangler d1 execute --remote`, with the operator's own wrangler
// login: no web route, so nothing new to secure. It prints room IDs but never an account ID or a name.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { formatShips, SHIPS_QUERY, type ShipLine } from "./shipsReport.ts";

const SERVER_DIR = resolve(import.meta.dirname, "../../../server");
const ENVS = ["production", "staging", "test"] as const;

const { values } = parseArgs({ options: { env: { type: "string" } } });
const env = values.env as (typeof ENVS)[number] | undefined;
if (!env || !ENVS.includes(env)) {
  console.error(`Usage: npm run ships -- --env <${ENVS.join("|")}>`);
  process.exit(1);
}

// Production is wrangler.jsonc's top level; staging and test are named environments (the deploy:* scripts do the same).
const args = ["wrangler", "d1", "execute", "DB", "--remote", "--json", "--command", SHIPS_QUERY, ...(env === "production" ? [] : ["--env", env])];
const run = spawnSync("npx", args, { cwd: SERVER_DIR, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
if (run.status !== 0) {
  console.error(run.stdout);
  process.exit(run.status ?? 1);
}
const [result] = JSON.parse(run.stdout) as { results: ShipLine[] }[];
console.log(`${env}: ${formatShips(result?.results ?? [], Date.now())}`);
