// Thin view layer: renders a PlayerView and emits intents. No game logic here;
// the server decides what is legal and sends it in view.legalActions.

import { useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import type { Action, GameServerMessage, PlayerView } from "@mush2/shared";
import { gameSocket, type SeatTicket } from "./net.ts";

export function GameScreen({ ticket, onLeave }: { ticket: SeatTicket; onLeave: () => void }) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState("");
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const socket = gameSocket(ticket.roomId, ticket.token);
    socketRef.current = socket;
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as GameServerMessage;
      if (msg.type === "view") {
        setView(msg.view);
        setError("");
      } else setError(msg.message);
    });
    // 4001 = invalid seat token (e.g. the local server was restarted).
    socket.addEventListener("close", (e: CloseEvent) => {
      if (e.code === 4001) onLeave();
    });
    return () => socket.close();
  }, [ticket, onLeave]);

  const send = (action: Action) => socketRef.current?.send(JSON.stringify({ type: "action", action }));

  if (!view) return <main>Connecting…</main>;
  const { you } = view;
  const moves = view.legalActions.filter((a) => a.type === "move");
  const canReady = view.legalActions.some((a) => a.type === "ready");
  const everyone = [you, ...view.players];

  return (
    <main>
      <header>
        <strong>{you.name}</strong> · role: {you.role} · AP: {you.ap} · cycle {view.cycle}
        <button onClick={onLeave}>Leave</button>
      </header>
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Rooms</h2>
        <ul>
          {Object.keys(view.rooms).map((room) => (
            <li key={room} className={room === you.room ? "here" : ""}>
              {room}: {everyone.filter((p) => p.room === room).map((p) => p.name).join(", ") || "—"}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Actions</h2>
        {moves.map((a) => (
          <button key={a.to} onClick={() => send(a)}>
            Move to {a.to}
          </button>
        ))}
        <button disabled={!canReady} onClick={() => send({ type: "ready" })}>
          {you.ready ? "Waiting for others…" : "End cycle"}
        </button>
      </section>

      <section>
        <h2>Log</h2>
        <ol reversed>
          {[...view.log].reverse().map((entry, i) => (
            <li key={view.log.length - i}>
              [{entry.cycle}] {entry.text}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
