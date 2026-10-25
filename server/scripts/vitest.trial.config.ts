// Only for the model trial (model.trial.ts, #224): `npm test` never runs it, since it calls a paid API.
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["scripts/*.trial.ts"], reporters: ["verbose"] } });
