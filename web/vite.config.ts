import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Never inline Mush/ art as base64: 152 small item icons alone doubled the JS bundle.
    // Everything else keeps Vite's default (inline under 4 KB).
    assetsInlineLimit: (file) => (file.includes("/Mush/") ? false : undefined),
  },
});
