// Tells a player whose tab is running an older build than the server that a reload will update it. A deploy drops
// every game and matchmaker socket; PartySocket reconnects the open tab, still on the old code, and the new server's
// first message is its build (`BuildMessage`, shared/src/protocol.ts). The page is never reloaded for the player,
// since that could throw away a half-typed message or a planned action.
//
// For a few minutes after a deploy, a reconnect can still reach the previous version of a Durable Object, so one
// mismatching build message isn't proof the tab is stale. The notice waits `GRACE_MS`, and any matching build message
// in that time (on any socket) calls it off.

import type { BuildMessage } from "@mush2/shared";
import i18n from "i18next";
import type PartySocket from "partysocket";
import { showUpdateAvailable } from "./Toasts.tsx";

/** This client's build (`RULES_VERSION`, web/vite.config.ts). */
const CLIENT_BUILD = __RULES_VERSION__;

/** How long a mismatch must go unanswered by a matching build before the notice shows. */
export const GRACE_MS = 5000;

/**
 * Whether the server runs a different build from this client. "dev" on either side (the dev server, or a local
 * wrangler behind `npm run preview`) never counts, so local work doesn't nag.
 */
export function isOutdated(serverBuild: string, clientBuild: string): boolean {
  return serverBuild !== "dev" && clientBuild !== "dev" && serverBuild !== clientBuild;
}

/**
 * Feeds server builds in and calls `notify` once, `GRACE_MS` after a mismatch, unless a matching build arrives first.
 * Separate from the sockets and the toast so it can be tested with fake timers.
 */
export function buildWatcher(clientBuild: string, notify: () => void): (serverBuild: string) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shown = false;
  return (serverBuild) => {
    if (shown) return;
    if (!isOutdated(serverBuild, clientBuild)) {
      clearTimeout(timer);
      timer = undefined;
      return;
    }
    timer ??= setTimeout(() => {
      shown = true;
      notify();
    }, GRACE_MS);
  };
}

const onBuild = buildWatcher(CLIENT_BUILD, () =>
  showUpdateAvailable(i18n.t("update.available"), i18n.t("update.reload"), () => location.reload()),
);

/** Listens on `socket` for the server's build and offers a reload once per page if it stays different. Returns `socket`. */
export function watchBuild(socket: PartySocket): PartySocket {
  socket.addEventListener("message", (e: MessageEvent<string>) => {
    const msg = JSON.parse(e.data) as { type: string };
    if (msg.type === "build") onBuild((msg as BuildMessage).version);
  });
  return socket;
}
