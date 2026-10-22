import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { shipMapEditor } from "../tools/src/editor/vitePlugin.ts";

export default defineConfig({
  // shipMapEditor: the ship map editor's save (dev server only; web/src/editor/).
  plugins: [react(), shipMapEditor()],
  build: {
    // Never inline Mush/ art as base64: 152 small item icons alone doubled the JS bundle.
    // Everything else keeps Vite's default (inline under 4 KB).
    assetsInlineLimit: (file) => (file.includes("/Mush/") ? false : undefined),
  },
});
