// `npm run retire-ships -- --env <test|staging|production|dev> [--yes]`: retires every running ship in that deployment
// (GameRoom.retire through `POST /admin/retire-ships`, server/src/adminRoutes.ts), as a MIN_STATE_VERSION bump would,
// without a deploy. Players aboard go back to the lobby, free to board, and the next join launches a new ship. Each
// ship's record stays for its replay.
//
// `--init` sets the deployment up once: it makes a random token, stores it as the Worker's `ADMIN_TOKEN` secret
// (`wrangler secret put`, with your own wrangler login) and keeps a copy in ~/.config/mush2/ for later runs. For `dev`
// it writes the token to server/.dev.vars instead; restart `npm run dev` after. A deployment that was never set up
// has no /admin/ routes.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { devPorts } from "../dev/ports.ts";

const SERVER_DIR = resolve(import.meta.dirname, "../../../server");
const DEV_VARS = join(SERVER_DIR, ".dev.vars");
const TOKEN_DIR = join(homedir(), ".config", "mush2");
const ENVS = ["production", "staging", "test", "dev"] as const;
type Target = (typeof ENVS)[number];

const URLS: Record<Exclude<Target, "dev">, string> = {
  production: "https://mush2-server.nearbearnearbear.workers.dev",
  staging: "https://mush2-server-staging.nearbearnearbear.workers.dev",
  test: "https://mush2-server-test.nearbearnearbear.workers.dev",
};

const { values } = parseArgs({ options: { env: { type: "string" }, init: { type: "boolean" }, yes: { type: "boolean" } } });
const env = values.env as Target | undefined;
if (!env || !ENVS.includes(env)) {
  console.error(`Usage: npm run retire-ships -- --env <${ENVS.join("|")}> [--init] [--yes]`);
  process.exit(1);
}

const tokenFile = join(TOKEN_DIR, `admin-token-${env}`);

function devVarsToken(): string | undefined {
  if (!existsSync(DEV_VARS)) return undefined;
  return readFileSync(DEV_VARS, "utf8").match(/^ADMIN_TOKEN\s*=\s*"?([^"\n]+)"?\s*$/m)?.[1];
}

function init(): void {
  const token = randomBytes(32).toString("base64url");
  if (env === "dev") {
    if (devVarsToken()) {
      console.error("server/.dev.vars already has ADMIN_TOKEN.");
      process.exit(1);
    }
    appendFileSync(DEV_VARS, `${existsSync(DEV_VARS) && !readFileSync(DEV_VARS, "utf8").endsWith("\n") ? "\n" : ""}ADMIN_TOKEN=${token}\n`);
    console.log("Wrote ADMIN_TOKEN to server/.dev.vars. Restart `npm run dev` to load it.");
    return;
  }
  // Production is wrangler.jsonc's top level; staging and test are named environments.
  const args = ["wrangler", "secret", "put", "ADMIN_TOKEN", ...(env === "production" ? [] : ["--env", env!])];
  const run = spawnSync("npx", args, { cwd: SERVER_DIR, input: token, stdio: ["pipe", "inherit", "inherit"] });
  if (run.status !== 0) process.exit(run.status ?? 1);
  mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  chmodSync(tokenFile, 0o600);
  console.log(`Set ADMIN_TOKEN on ${env} and saved it to ${tokenFile}.`);
}

async function retire(): Promise<void> {
  const token = env === "dev" ? devVarsToken() : existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : undefined;
  if (!token) {
    console.error(`No admin token for ${env}. Run: npm run retire-ships -- --env ${env} --init`);
    process.exit(1);
  }
  if (!values.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Retire every running ship on ${env}? Players aboard go back to the lobby. [y/N] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log("Nothing done.");
      return;
    }
  }
  const base = env === "dev" ? `http://localhost:${devPorts().server}` : URLS[env!];
  const res = await fetch(`${base}/admin/retire-ships`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const hint = res.status === 404 ? " (no ADMIN_TOKEN on the server, or it predates this route: deploy, then --init)" : "";
    console.error(`${env}: HTTP ${res.status}${hint}`);
    process.exit(1);
  }
  const { retired, skipped, failed } = (await res.json()) as {
    retired: string[];
    skipped: string[];
    failed: { roomId: string; errorName: string; message?: string }[];
  };
  console.log(`${env}: retired ${retired.length}, not running ${skipped.length}, failed ${failed.length}`);
  for (const id of retired) console.log(`  retired ${id}`);
  for (const f of failed) console.log(`  FAILED  ${f.roomId}: ${f.errorName}${f.message ? `: ${f.message}` : ""} (run again to retry)`);
  if (failed.length > 0) process.exit(1);
}

if (values.init) init();
else await retire();
