// `npm run dev`: wrangler plus Vite on this checkout's ports (see ports.ts).
// In the main checkout that is :8787 and :5173, as before.

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { devPorts, ensureDevVars } from "./ports.ts";

const p = devPorts();
ensureDevVars();
console.log(`dev: web http://localhost:${p.web}  server http://localhost:${p.server}${p.slot ? "  (worktree)" : ""}`);

const child = spawn(
  "npx",
  [
    "concurrently", "-k", "-n", "server,web", "-c", "blue,green",
    `npm run dev -w server -- --port ${p.server} --inspector-port ${p.inspector}`,
    `npm run dev -w web -- --port ${p.web} --strictPort`,
  ],
  { stdio: "inherit", cwd: resolve(import.meta.dirname, "../../.."), env: { ...process.env, VITE_PARTY_HOST: `localhost:${p.server}` } },
);
child.on("exit", (code) => process.exit(code ?? 1));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
