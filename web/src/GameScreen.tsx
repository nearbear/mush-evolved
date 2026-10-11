// Thin view layer: renders a PlayerView and emits intents. No game logic here;
// the server decides what is legal and sends it in view.legalActions.

import { useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import { CHARACTERS, type Action, type GameServerMessage, type PlayerView } from "@mush2/shared";
import { portrait } from "./art/assets.ts";
import { gameSocket, type SeatTicket } from "./net.ts";
import { IsoRoom } from "./iso/IsoRoom.tsx";
import { useShipLayout } from "./iso/shipLayout.ts";
import { ShipMap } from "./scene/ShipMap.tsx";

export function GameScreen({ ticket, onLeave }: { ticket: SeatTicket; onLeave: () => void }) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState("");
  const socketRef = useRef<PartySocket | null>(null);
  const layout = useShipLayout();

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

  if (!view) return <main className="connecting">Connecting…</main>;
  const { you } = view;
  const reachable = new Set(view.legalActions.flatMap((a) => (a.type === "move" ? [a.to] : [])));
  const canReady = view.legalActions.some((a) => a.type === "ready");
  const character = CHARACTERS.find((c) => c.id === you.character);

  return (
    <main className="game">
      <header className="top-bar">
        <img className="avatar" src={portrait(you.character)} alt="" />
        <div>
          <strong>{you.name}</strong>
          {character && <div className="sub">{character.name}</div>}
        </div>
        <span className={`role ${you.role}`}>{you.role}</span>
        <span className="ap" title={`${you.ap} action points`}>
          {Array.from({ length: Math.max(you.ap, 0) }, (_, i) => (
            <i key={i} />
          ))}
          <span className="sub">{you.ap} AP</span>
        </span>
        <span className="cycle">Cycle {view.cycle}</span>
        <span className="spacer" />
        <button disabled={!canReady} onClick={() => send({ type: "ready" })}>
          {you.ready ? "Waiting for others…" : "End cycle"}
        </button>
        <button onClick={onLeave}>Leave</button>
      </header>
      {error && <p className="error">{error}</p>}

      <div className="stage">
        {layout ? (
          <IsoRoom
            layout={layout}
            room={you.room}
            occupants={[you, ...view.players.filter((p) => p.room === you.room)]
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, character: p.character, you: p.id === you.id }))}
            reachable={reachable}
            onMove={(to) => send({ type: "move", to })}
          />
        ) : (
          <section className="iso-room">Loading ship…</section>
        )}
        <aside className="log">
          <h2>Log</h2>
          <ol reversed>
            {[...view.log].reverse().map((entry, i) => (
              <li key={view.log.length - i}>
                <span className="sub">[{entry.cycle}]</span> {entry.text}
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <ShipMap
        rooms={Object.keys(view.rooms)}
        you={you}
        people={[you, ...view.players]}
        reachable={reachable}
        onMove={(to) => send({ type: "move", to })}
      />

      <Credits />
    </main>
  );
}

function Credits() {
  return (
    <footer className="credits">
      Art from <em>Mush</em> by Motion Twin (
      <a href="https://github.com/motion-twin/WebGamesArchives">WebGamesArchives</a>), licensed{" "}
      <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>. Sprite backgrounds made
      transparent. Not affiliated with Motion Twin.
    </footer>
  );
}
