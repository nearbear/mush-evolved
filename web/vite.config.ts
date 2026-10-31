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

export default defineConfig(({ command }) => ({
  // shipMapEditor: the ship map editor's save (dev server only; web/src/editor/).
  plugins: [react(), shipMapEditor()],
  // The OS username prefills the dev sign-in box (#287). Dev server only: a production build never embeds it.
  define: { __DEV_SIGN_IN_NAME__: JSON.stringify(command === "serve" ? userInfo().username : "") },
  server: { proxy },
  preview: { proxy },
  build: {
    // Never inline Mush/ art as base64: 152 small item icons alone doubled the JS bundle.
    // Everything else keeps Vite's default (inline under 4 KB).
    assetsInlineLimit: (file) => (file.includes("/Mush/") ? false : undefined),
  },
}));
