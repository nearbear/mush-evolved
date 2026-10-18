// Dev-server ports for this checkout. The main checkout keeps the usual ports;
// each git worktree gets its own offset (derived from its path) so its servers
// can run beside the main ones and the screenshot tool finds the right pair.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export interface DevPorts {
  web: number;
  server: number;
  inspector: number;
  /** 0 for the main checkout. */
  slot: number;
}

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

export function devPorts(): DevPorts {
  const isWorktree = git("rev-parse", "--absolute-git-dir") !== git("rev-parse", "--path-format=absolute", "--git-common-dir");
  let slot = 0;
  if (isWorktree) {
    let hash = 0;
    for (const ch of git("rev-parse", "--show-toplevel")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    slot = 1 + (hash % 99);
  }
  return { web: 5173 + slot, server: 8787 + slot, inspector: 9229 + slot, slot };
}

/**
 * `server/.dev.vars` (ALLOW_CHEATS and friends) is gitignored, so a new worktree
 * lacks it and its server would run with cheats off. Copy the main checkout's.
 */
export function ensureDevVars(): void {
  const here = join(git("rev-parse", "--show-toplevel"), "server/.dev.vars");
  if (existsSync(here)) return;
  const main = join(dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir")), "server/.dev.vars");
  if (main === here || !existsSync(main)) return;
  copyFileSync(main, here);
  console.log("dev: copied server/.dev.vars from the main checkout");
}

if (import.meta.main) {
  const p = devPorts();
  console.log(`web http://localhost:${p.web}  server http://localhost:${p.server}${p.slot ? "  (worktree)" : ""}`);
}
