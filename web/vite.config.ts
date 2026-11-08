import { execSync } from "node:child_process";
import { userInfo } from "node:os";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { shipMapEditor } from "../tools/src/editor/vitePlugin.ts";

// The dev server and `vite preview` forward the Worker's routes to wrangler, so
// the client is on one origin as in production: cookies just work, no CORS.
// Port from tools/src/dev (per worktree); Host is kept so the Worker sees this origin.
const worker = `http://localhost:${process.env.MUSH2_SERVER_PORT ?? 8787}`;
const proxy = {
  "/auth": { target: worker },
  "/api": { target: worker },
  "/parties": { target: worker, ws: true },
};

/**
 * The build's `RULES_VERSION`, as the server's deploy scripts stamp it (server/package.json): the commit, so a replay
 * frame recorded by another build gets a badge (#369). "dev" on the dev server, like the server's own default.
 */
function rulesVersion(command: string): string {
  if (command === "serve") return "dev";
  if (process.env.RULES_VERSION) return process.env.RULES_VERSION;
  try {
    return execSync("git describe --always --dirty --abbrev=40", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

export default defineConfig(({ command }) => ({
  // shipMapEditor: the ship map editor's save (dev server only; web/src/editor/).
  plugins: [react(), shipMapEditor()],
  // The OS username prefills the dev sign-in box (#287). Dev server only: a production build never embeds it.
  define: {
    __DEV_SIGN_IN_NAME__: JSON.stringify(command === "serve" ? userInfo().username : ""),
    __RULES_VERSION__: JSON.stringify(rulesVersion(command)),
  },
  server: { proxy },
  preview: { proxy },
  build: {
    // Never inline Mush/ art as base64: 152 small item icons alone doubled the JS bundle.
    // Everything else keeps Vite's default (inline under 4 KB).
    assetsInlineLimit: (file) => (file.includes("/Mush/") ? false : undefined),
  },
}));
