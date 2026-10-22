// Runs the editor's map checks (checks.ts) off the main thread: drawing the ship from every room to
// find loose wall ends takes about half a second. Each request carries the map and a number, which
// comes back with its problems so the editor can drop stale answers. The art comes with the first
// request only. The worker says "ready" once loaded, and the editor sends nothing before that: messages
// posted while a module worker is still loading its imports were sometimes lost.

import type { ShipArt, ShipMap } from "@mush2/shared";
import { problems } from "./checks.ts";

export interface CheckRequest {
  seq: number;
  map: ShipMap;
  art?: ShipArt;
}
export type CheckReply = { ready: true } | { seq: number; problems: ReturnType<typeof problems> };

let art: ShipArt | undefined;
self.addEventListener("message", (e: MessageEvent<CheckRequest>) => {
  art = e.data.art ?? art;
  if (!art) return;
  const reply: CheckReply = { seq: e.data.seq, problems: problems({ ...art, ...e.data.map }) };
  self.postMessage(reply);
});
self.postMessage({ ready: true } satisfies CheckReply);
