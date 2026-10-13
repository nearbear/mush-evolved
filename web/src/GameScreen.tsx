// Thin view layer: renders a PlayerView and emits intents. No game logic here;
// the server decides what is legal and sends it in view.legalActions.

import { useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import type { Action, GameClientMessage, GameServerMessage, PlayerView, RoomId, Target } from "@mush2/shared";
import { BottomNav, type MobilePanel } from "./hud/BottomNav.tsx";
import { InspectPanel } from "./hud/InspectPanel.tsx";
import { InventoryPanel } from "./hud/InventoryPanel.tsx";
import { ITrackie } from "./hud/ITrackie.tsx";
import { PeekBar } from "./hud/PeekBar.tsx";
import { resolveTarget } from "./hud/targets.ts";
import { TopBar } from "./hud/TopBar.tsx";
import { gameSocket, type SeatTicket } from "./net.ts";
import { IsoRoom } from "./iso/IsoRoom.tsx";
import { useShipLayout } from "./iso/shipLayout.ts";
import { Minimap } from "./scene/Minimap.tsx";
import { useMobile } from "./useMobile.ts";

export function GameScreen({ ticket, onLeave }: { ticket: SeatTicket; onLeave: () => void }) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState("");
  const socketRef = useRef<PartySocket | null>(null);
  const layout = useShipLayout();
  /** UI-only state: what the inspect panel shows. Null means yourself. */
  const [selected, setSelected] = useState<Target | null>(null);
  // Phone layout only: which panel is on screen, and a door tapped in the room.
  const mobile = useMobile();
  const [panel, setPanel] = useState<MobilePanel>("room");
  const [peekDoor, setPeekDoor] = useState<RoomId | null>(null);
  const here = view?.you.room;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `here` is a trigger: arriving somewhere new clears the door peek.
  useEffect(() => setPeekDoor(null), [here]);

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

  if (!view) return <main className="connecting loading">Connecting…</main>;
  const { you } = view;
  const reachable = new Set(view.legalActions.flatMap((a) => (a.type === "move" ? [a.to] : [])));
  const move = (to: string) => send({ type: "move", to });
  const select = (t: Target | null) => {
    setSelected(t);
    setPeekDoor(null);
  };
  const tapDoor = (to: RoomId) => {
    setSelected(null);
    setPeekDoor(to);
  };
  // Fall back to yourself when nothing is selected or the selection is gone (left the room, item moved away).
  const target: Target = selected && resolveTarget(view, selected) ? selected : { kind: "player", id: you.id };

  return (
    <main className="game">
      <TopBar
        view={view}
        canReady={view.legalActions.some((a) => a.type === "ready")}
        onReady={() => send({ type: "ready" })}
        onLeave={onLeave}
      />
      {error && <p className="error">{error}</p>}

      <div className="three-panel" data-panel={panel}>
        <div className="left-column">
          <InspectPanel view={view} target={target} onAction={send} onClose={() => select(null)} />
          <InventoryPanel view={view} selected={target} onAction={send} onSelect={select} />
          {mobile && <Credits />}
        </div>

        <div className="world">
          {layout ? (
            <IsoRoom
              layout={layout}
              room={you.room}
              occupants={[you, ...view.players.filter((p) => p.room === you.room)]
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, character: p.character, you: p.id === you.id }))}
              equipment={view.roomEquipment}
              reachable={reachable}
              selected={target}
              selectedDoor={peekDoor}
              fillPanel={mobile}
              onMove={move}
              onSelect={select}
              onDoorTap={tapDoor}
            />
          ) : (
            <section className="iso-room loading">Loading ship…</section>
          )}
          <Minimap here={you.room} youId={you.id} people={[you, ...view.players]} reachable={reachable} onMove={move} />
        </div>

        <ITrackie view={view} onChat={(channel, text) => post({ type: "chat", channel, text })} />
      </div>

      {mobile && panel === "room" && (
        <PeekBar
          view={view}
          target={selected && resolveTarget(view, selected) ? selected : null}
          door={peekDoor}
          reachable={reachable}
          onAction={send}
          onMove={move}
          onMore={() => setPanel("inspect")}
          onClose={() => select(null)}
        />
      )}
      {mobile ? <BottomNav panel={panel} onChange={setPanel} /> : <Credits />}
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
