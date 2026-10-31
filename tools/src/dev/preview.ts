// `npm run preview`: build the web client for production, then serve it with
// `vite preview` beside the local wrangler server, which vite preview proxies to
// (MUSH2_SERVER_PORT, see web/vite.config.ts).

import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { devPorts, ensureDevVars } from "./ports.ts";

const p = devPorts();
ensureDevVars();
const root = resolve(import.meta.dirname, "../../..");
const env = { ...process.env, MUSH2_SERVER_PORT: String(p.server) };

const build = spawnSync("npm", ["run", "build", "-w", "web"], { stdio: "inherit", cwd: root, env });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log(`preview: web http://localhost:${p.web}  server http://localhost:${p.server}${p.slot ? "  (worktree)" : ""}`);

const child = spawn(
  "npx",
  [
    "concurrently", "-k", "-n", "server,web", "-c", "blue,green",
    `npm run dev -w server -- --port ${p.server} --inspector-port ${p.inspector}`,
    `npm run preview -w web -- --port ${p.web} --strictPort`,
  ],
  { stdio: "inherit", cwd: root, env },
);
child.on("exit", (code) => process.exit(code ?? 1));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
