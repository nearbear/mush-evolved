// The live game: owns the seat's socket, keeps the newest view and the server's extras from it, and sends the
// view-only GameView's intents back. Everything on screen is GameView's.

import { useCallback, useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import { MAX_CHAT_LENGTH, MAX_CHAT_LINES, type BotPause, type GameClientMessage, type GameServerMessage, type PlayerView } from "@mush2/shared";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { GameView } from "./GameView.tsx";
import type { ServerClock } from "./hud/serverClock.ts";
import { RenderWatch } from "./RenderWatch.tsx";
import { shareUnchanged } from "./shareView.ts";
import { gameSocket, type SeatTicket } from "./net.ts";
import { showError } from "./Toasts.tsx";
import { ChatPagesProvider, useChatPageCache } from "./chatPages.tsx";

/** How slow-render warnings name this screen (dev console only). */
const WATCH_ID = "GameView"; // i18n-ignore: dev console only

export function GameScreen({ ticket, onLeave, waking = false }: { ticket: SeatTicket; onLeave: () => void; waking?: boolean }) {
  const { t } = useTranslation();
  const [view, setView] = useState<PlayerView | null>(null);
  const [cheatsAllowed, setCheatsAllowed] = useState(false);
  /** Server clock minus ours, from each view message, so action bars (server ms) drain at the right moment. */
  const [clock, setClock] = useState<ServerClock>({ offset: 0 });
  const [nextCycleAt, setNextCycleAt] = useState<number | null>(null);
  const [botsPaused, setBotsPaused] = useState<BotPause | null>(null);
  const socketRef = useRef<PartySocket | null>(null);
  // Stable, so the page cache's `request` (and everything that depends on it) doesn't change every render.
  const send = useCallback((msg: GameClientMessage) => socketRef.current?.send(JSON.stringify(msg)), []);
  const chatPages = useChatPageCache(send);
  const handleChatPages = chatPages.handle;

  useEffect(() => {
    const socket = gameSocket(ticket.roomId, ticket.token);
    socketRef.current = socket;
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as GameServerMessage;
      if (msg.type === "view") {
        // Unchanged parts keep their identity, so memoized components skip them (shareView.ts).
        setView((prev) => shareUnchanged(prev, msg.view));
        setCheatsAllowed(msg.cheatsAllowed);
        setClock({ offset: msg.now - Date.now() });
        setNextCycleAt(msg.nextCycleAt);
        setBotsPaused(msg.botsPaused);
      } else if (handleChatPages(msg)) {
        // A fetched page, or ticks on one (chatPages.tsx).
      } else if (msg.type === "error") showError(i18n.t(`errors.${msg.message}` as never, { defaultValue: msg.message, max: MAX_CHAT_LENGTH, lines: MAX_CHAT_LINES }));
    });
    // 4001 = invalid seat token (e.g. the local server was restarted). 4002 = the ship can't be loaded by this build
    // (#384); the lobby's Resume then says so.
    socket.addEventListener("close", (e: CloseEvent) => {
      if (e.code === 4001 || e.code === 4002) onLeave();
    });
    return () => socket.close();
  }, [ticket, onLeave, handleChatPages]);

  if (!view) return <main className="connecting loading">{t("common.connecting")}</main>;
  return (
    <ChatPagesProvider value={chatPages.value}>
    <RenderWatch id={WATCH_ID}>
    <GameView
      view={view}
      send={send}
      onLeave={onLeave}
      waking={waking}
      cheatsAllowed={cheatsAllowed}
      clock={clock}
      nextCycleAt={nextCycleAt}
      botsPaused={botsPaused}
      replayId={ticket.roomId}
    />
    </RenderWatch>
    </ChatPagesProvider>
  );
}
