// The live game: owns the seat's socket, keeps the newest view and the server's extras from it, and sends the
// view-only GameView's intents back. Everything on screen is GameView's.

import { useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import { MAX_CHAT_LENGTH, MAX_CHAT_LINES, type BotPause, type GameClientMessage, type GameServerMessage, type PlayerView } from "@mush2/shared";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { GameView } from "./GameView.tsx";
import { gameSocket, type SeatTicket } from "./net.ts";
import { showError } from "./Toasts.tsx";

export function GameScreen({ ticket, onLeave, waking = false }: { ticket: SeatTicket; onLeave: () => void; waking?: boolean }) {
  const { t } = useTranslation();
  const [view, setView] = useState<PlayerView | null>(null);
  const [cheatsAllowed, setCheatsAllowed] = useState(false);
  /** Server clock minus ours, from each view message, so action bars (server ms) drain at the right moment. */
  const [clockOffset, setClockOffset] = useState(0);
  const [nextCycleAt, setNextCycleAt] = useState<number | null>(null);
  const [botsPaused, setBotsPaused] = useState<BotPause | null>(null);
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const socket = gameSocket(ticket.roomId, ticket.token);
    socketRef.current = socket;
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as GameServerMessage;
      if (msg.type === "view") {
        setView(msg.view);
        setCheatsAllowed(msg.cheatsAllowed);
        setClockOffset(msg.now - Date.now());
        setNextCycleAt(msg.nextCycleAt);
        setBotsPaused(msg.botsPaused);
      } else if (msg.type === "chatEdit" || msg.type === "chatPage") {
        // A fetched page and ticks on one; the page cache that uses them is phase 4 of docs/plans/chat-pages.md.
      } else showError(i18n.t(`errors.${msg.message}` as never, { defaultValue: msg.message, max: MAX_CHAT_LENGTH, lines: MAX_CHAT_LINES }));
    });
    // 4001 = invalid seat token (e.g. the local server was restarted).
    socket.addEventListener("close", (e: CloseEvent) => {
      if (e.code === 4001) onLeave();
    });
    return () => socket.close();
  }, [ticket, onLeave]);

  const send = (msg: GameClientMessage) => socketRef.current?.send(JSON.stringify(msg));

  if (!view) return <main className="connecting loading">{t("common.connecting")}</main>;
  return (
    <GameView
      view={view}
      send={send}
      onLeave={onLeave}
      waking={waking}
      cheatsAllowed={cheatsAllowed}
      clockOffset={clockOffset}
      nextCycleAt={nextCycleAt}
      botsPaused={botsPaused}
    />
  );
}
