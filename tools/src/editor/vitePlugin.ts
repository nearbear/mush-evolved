// The ship map editor's save (web/src/editor/, dev server only): `PUT /__editor/map` with the whole map
// as JSON. It is checked (validateMap), written to Mush/derived/ship-map.json in its one-tile-per-line
// format, and the rules' ship-rooms.json is regenerated from it, as `npm run ship-layout` would.
//
// Vite would reload any page that imports those files once they change, which would lose the editor's
// undo history on every save, so the files this plugin has just written don't trigger a reload. Other
// tabs (the game) pick the change up when reloaded; wrangler watches ship-rooms.json itself.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ShipMap } from "@mush2/shared";
import type { Plugin } from "vite";
import { formatRooms, roomGraph } from "../shipLayout/convert.ts";
import { DERIVED, readArt, writeMap } from "../shipLayout/shipMap.ts";
import { validateMap } from "../shipLayout/validate.ts";

/** The longest body accepted: the map is about 330 KB. */
const MAX_BYTES = 5_000_000;

/** How long after a save its own file changes are kept from reloading pages. */
const QUIET_MS = 3000;

export function shipMapEditor(): Plugin {
  let savedAt = 0;
  return {
    name: "mush2-ship-map-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/map", (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "PUT") return reply(405, { errors: ["PUT the whole map"] });
        let body = "";
        let size = 0;
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => {
          size += chunk.length;
          if (size <= MAX_BYTES) body += chunk;
        });
        req.on("end", () => {
          if (size > MAX_BYTES) return reply(413, { errors: ["the map is too big"] });
          let map: ShipMap;
          try {
            map = JSON.parse(body) as ShipMap;
          } catch {
            return reply(400, { errors: ["not JSON"] });
          }
          const errors = validateMap(map, readArt());
          if (errors.length) return reply(422, { errors });
          savedAt = Date.now();
          writeMap(map);
          writeFileSync(resolve(DERIVED, "ship-rooms.json"), formatRooms(roomGraph(map)));
          reply(200, { ok: true });
        });
      });
    },
    handleHotUpdate({ file }) {
      const ours = file.endsWith("/derived/ship-map.json") || file.endsWith("/derived/ship-rooms.json");
      return ours && Date.now() - savedAt < QUIET_MS ? [] : undefined;
    },
  };
}
