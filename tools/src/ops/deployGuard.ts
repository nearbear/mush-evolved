// `node tools/src/ops/deployGuard.ts --env <production|staging|test>`: runs first in every `npm run deploy:*`. Compares
// STATE_VERSION and MIN_STATE_VERSION (shared/src/normalizeState.ts) in the build going out against the build live on
// that Worker (its RULES_VERSION commit, read with `wrangler versions view`). When either moves, it prints a large
// warning and stops unless you type the environment's name. Without a terminal (CI) it stops unless
// ALLOW_VERSION_CHANGE is set to the environment's name. See docs/ops/deploy.md, "Live games across deploys".

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dirname, "../../..");
const SERVER_DIR = resolve(ROOT, "server");
const NORMALIZE = "shared/src/normalizeState.ts";
const ENVS = ["production", "staging", "test"] as const;
type Target = (typeof ENVS)[number];

const { values } = parseArgs({ options: { env: { type: "string" } } });
const env = values.env as Target | undefined;
if (!env || !ENVS.includes(env)) {
  console.error(`Usage: node tools/src/ops/deployGuard.ts --env <${ENVS.join("|")}>`);
  process.exit(1);
}

type Versions = { state: number; min: number };

function versionsIn(source: string): Versions | undefined {
  const state = source.match(/export const STATE_VERSION = (\d+);/)?.[1];
  const min = source.match(/export const MIN_STATE_VERSION = (\d+);/)?.[1];
  return state && min ? { state: Number(state), min: Number(min) } : undefined;
}

function run(cmd: string, args: string[], cwd = ROOT): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { ok: r.status === 0, out: r.stdout ?? "" };
}

function wrangler(args: string[]): unknown {
  const envArgs = env === "production" ? [] : ["--env", env!];
  const r = run("npx", ["wrangler", ...args, ...envArgs, "--json"], SERVER_DIR);
  if (!r.ok) return undefined;
  try {
    return JSON.parse(r.out);
  } catch {
    return undefined;
  }
}

/** The live build's RULES_VERSION (`<commit>` or `<commit>-dirty`), or a reason it couldn't be read. */
function liveRulesVersion(): { version: string } | { problem: string } {
  const status = wrangler(["deployments", "status"]) as { versions?: { version_id: string; percentage: number }[] } | undefined;
  if (!status) return { problem: "`wrangler deployments status` failed (not logged in, or nothing deployed yet)" };
  const versions = status.versions ?? [];
  if (versions.length !== 1) return { problem: `the live deployment is split across ${versions.length} versions` };
  const view = wrangler(["versions", "view", versions[0]!.version_id]) as
    | { resources?: { bindings?: { name: string; text?: string }[] } }
    | undefined;
  const text = view?.resources?.bindings?.find((b) => b.name === "RULES_VERSION")?.text;
  return text ? { version: text } : { problem: "the live version has no RULES_VERSION" };
}

/** normalizeState.ts at `commit`, fetching that one commit if this checkout lacks it (CI clones shallow). */
function sourceAt(commit: string): string | undefined {
  const path = `${commit}:${NORMALIZE}`;
  let r = run("git", ["show", path]);
  if (!r.ok) {
    run("git", ["fetch", "--quiet", "--depth=1", "origin", commit]);
    r = run("git", ["show", path]);
  }
  return r.ok ? r.out : undefined;
}

const outgoing = versionsIn(readFileSync(resolve(ROOT, NORMALIZE), "utf8"));
if (!outgoing) {
  console.error(`deploy guard: can't find STATE_VERSION and MIN_STATE_VERSION in ${NORMALIZE}; update deployGuard.ts.`);
  process.exit(1);
}

const warnings: string[] = [];
const live = liveRulesVersion();
if ("problem" in live) {
  warnings.push(`Can't tell what is live on ${env}: ${live.problem}.`, "This deploy may change the game version unchecked.");
} else {
  const commit = live.version.replace(/-dirty$/, "");
  const before = /^[0-9a-f]{7,40}$/.test(commit) ? sourceAt(commit) : undefined;
  const was = before ? versionsIn(before) : undefined;
  if (!was) {
    warnings.push(`Can't read ${NORMALIZE} at the live commit ${live.version}.`, "This deploy may change the game version unchecked.");
  } else {
    if (outgoing.min > was.min) {
      warnings.push(
        `MIN_STATE_VERSION goes ${was.min} -> ${outgoing.min}.`,
        `EVERY GAME RUNNING ON ${env.toUpperCase()} ENDS. Players go back to the lobby; only the replays are kept.`,
      );
    }
    if (outgoing.state > was.state) {
      warnings.push(
        `STATE_VERSION goes ${was.state} -> ${outgoing.state}.`,
        "Running games are upgraded, but once they save you can't roll back past this deploy (docs/ops/rollback.md).",
      );
    }
    if (outgoing.state < was.state) {
      warnings.push(
        `STATE_VERSION goes DOWN ${was.state} -> ${outgoing.state}: this build is older than the live one.`,
        "Every ship saved by the live build becomes UNAVAILABLE until a newer build goes out again.",
      );
    }
    if (warnings.length > 0 && live.version.endsWith("-dirty")) {
      warnings.push(`(The live build ${live.version} was deployed from uncommitted changes, so it may differ from that commit.)`);
    }
  }
}

if (warnings.length === 0) {
  console.log(`deploy guard: game version unchanged on ${env} (STATE_VERSION ${outgoing.state}, MIN_STATE_VERSION ${outgoing.min}).`);
  process.exit(0);
}

const RED = process.stderr.isTTY ? "\x1b[1;97;41m" : "";
const BOLD = process.stderr.isTTY ? "\x1b[1;91m" : "";
const RESET = process.stderr.isTTY ? "\x1b[0m" : "";
const bar = "!".repeat(78);
const banner = [
  "",
  `${RED}${bar}${RESET}`,
  `${RED}${`  GAME VERSION CHANGE: deploy to ${env.toUpperCase()}`.padEnd(78)}${RESET}`,
  `${RED}${bar}${RESET}`,
  "",
  ...warnings.map((w) => `${BOLD}  ${w}${RESET}`),
  "",
  `${RED}${bar}${RESET}`,
  "",
].join("\n");
console.error(banner);

if (process.env.ALLOW_VERSION_CHANGE === env) {
  console.error(`ALLOW_VERSION_CHANGE=${env} is set: deploying.`);
  process.exit(0);
}
if (!process.stdin.isTTY) {
  console.error(`Deploy stopped. No terminal to confirm in: set ALLOW_VERSION_CHANGE=${env} to deploy anyway.`);
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stderr });
const answer = await rl.question(`Type ${BOLD}${env}${RESET} to deploy anyway, anything else to stop: `);
rl.close();
if (answer.trim() !== env) {
  console.error("Deploy stopped. Nothing was built, migrated or uploaded.");
  process.exit(1);
}
console.error("Confirmed: deploying.");
