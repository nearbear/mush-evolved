// Only for the dev trials (model.trial.ts, #224, which calls a paid API; survival.trial.ts): `npm test` never runs them.
// TRIAL_FILE (run-trial.mjs) picks one.
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: [`scripts/${process.env.TRIAL_FILE ?? "model"}.trial.ts`], reporters: ["verbose"] } });
