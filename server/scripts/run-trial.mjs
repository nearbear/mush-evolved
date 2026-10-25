// Passes this script's arguments to model.trial.ts through TRIAL_ARGS and runs it under Vitest.
import { spawnSync } from "node:child_process";

const env = { ...process.env, TRIAL_ARGS: JSON.stringify(process.argv.slice(2)) };
const r = spawnSync("npx", ["vitest", "run", "--config", "scripts/vitest.trial.config.ts", "--silent=false"], { stdio: "inherit", env, cwd: new URL("..", import.meta.url) });
process.exit(r.status ?? 1);
