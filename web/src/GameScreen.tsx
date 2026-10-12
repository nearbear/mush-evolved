// Thin view layer: renders a PlayerView and emits intents. No game logic here;
// the server decides what is legal and sends it in view.legalActions.

import { useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import type { Action, GameClientMessage, GameServerMessage, PlayerView } from "@mush2/shared";
import { InspectPanel } from "./hud/InspectPanel.tsx";
import { ITrackie } from "./hud/ITrackie.tsx";
import { TopBar } from "./hud/TopBar.tsx";
import { gameSocket, type SeatTicket } from "./net.ts";
import { IsoRoom } from "./iso/IsoRoom.tsx";
import { useShipLayout } from "./iso/shipLayout.ts";
import { ShipMap } from "./scene/ShipMap.tsx";

export function GameScreen({ ticket, onLeave }: { ticket: SeatTicket; onLeave: () => void }) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState("");
  const socketRef = useRef<PartySocket | null>(null);
  const layout = useShipLayout();
  /** UI-only state: who the inspect panel shows. */
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const post = (msg: GameClientMessage) => socketRef.current?.send(JSON.stringify(msg));
  const send = (action: Action) => post({ type: "action", action });

  if (!view) return <main className="connecting">Connecting…</main>;
  const { you } = view;
  const reachable = new Set(view.legalActions.flatMap((a) => (a.type === "move" ? [a.to] : [])));
  const move = (to: string) => send({ type: "move", to });

  return (
    <main className="game">
      <TopBar
        view={view}
        canReady={view.legalActions.some((a) => a.type === "ready")}
        onReady={() => send({ type: "ready" })}
        onLeave={onLeave}
      />
      {error && <p className="error">{error}</p>}

      <div className="three-panel">
        <InspectPanel view={view} selectedId={selectedId} onClose={() => setSelectedId(null)} />

        <div className="world">
          {layout ? (
            <IsoRoom
              layout={layout}
              room={you.room}
              occupants={[you, ...view.players.filter((p) => p.room === you.room)]
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, character: p.character, you: p.id === you.id }))}
              reachable={reachable}
              selectedId={selectedId}
              onMove={move}
              onSelect={setSelectedId}
            />
          ) : (
            <section className="iso-room">Loading ship…</section>
          )}
          <ShipMap rooms={Object.keys(view.rooms)} you={you} people={[you, ...view.players]} reachable={reachable} onMove={move} />
        </div>

        <ITrackie view={view} onChat={(text) => post({ type: "chat", channel: "global", text })} />
      </div>

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
