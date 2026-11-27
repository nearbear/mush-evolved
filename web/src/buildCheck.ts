// Tells a player whose tab is running an older build than the server that a reload will update it. A deploy drops
// every game and matchmaker socket; PartySocket reconnects the open tab, still on the old code, and the new server's
// first message is its build (`BuildMessage`, shared/src/protocol.ts). The page is never reloaded for the player,
// since that could throw away a half-typed message or a planned action.

import type { BuildMessage } from "@mush2/shared";
import i18n from "i18next";
import type PartySocket from "partysocket";
import { showUpdateAvailable } from "./Toasts.tsx";

/** This client's build (`RULES_VERSION`, web/vite.config.ts). */
const CLIENT_BUILD = __RULES_VERSION__;

/**
 * Whether the server runs a different build from this client. "dev" on either side (the dev server, or a local
 * wrangler behind `npm run preview`) never counts, so local work doesn't nag.
 */
export function isOutdated(serverBuild: string, clientBuild: string): boolean {
  return serverBuild !== "dev" && clientBuild !== "dev" && serverBuild !== clientBuild;
}

let shown = false;

/** Listens on `socket` for the server's build and offers a reload once per page if it differs. Returns `socket`. */
export function watchBuild(socket: PartySocket): PartySocket {
  socket.addEventListener("message", (e: MessageEvent<string>) => {
    if (shown) return;
    const msg = JSON.parse(e.data) as { type: string };
    if (msg.type !== "build" || !isOutdated((msg as BuildMessage).version, CLIENT_BUILD)) return;
    shown = true;
    showUpdateAvailable(i18n.t("update.available"), i18n.t("update.reload"), () => location.reload());
  });
  return socket;
}
