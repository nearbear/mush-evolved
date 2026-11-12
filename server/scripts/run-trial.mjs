// Passes this script's arguments to a trial under Vitest through TRIAL_ARGS: model.trial.ts by default, or the one named
// by `--trial <name>` as the first argument (survival.trial.ts: `--trial survival`).
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const named = argv[0] === "--trial";
// TRIAL_CWD: where `npm run` was typed (npx resets INIT_CWD to server/), so a trial reads paths as the caller typed them.
const env = { ...process.env, TRIAL_CWD: process.env.INIT_CWD ?? process.cwd(), TRIAL_FILE: named ? argv[1] : "model", TRIAL_ARGS: JSON.stringify(named ? argv.slice(2) : argv) };
const r = spawnSync("npx", ["vitest", "run", "--config", "scripts/vitest.trial.config.ts", "--silent=false"], { stdio: "inherit", env, cwd: new URL("..", import.meta.url) });
process.exit(r.status ?? 1);
