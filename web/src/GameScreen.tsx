// Thin view layer: renders a PlayerView and emits intents. No game logic here;
// the server decides what is legal and sends it in view.legalActions.

import { useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import type { Action, ActopiCheat, CharacterId, Cheat, GameClientMessage, GameServerMessage, PlayerView, RoomId, Target } from "@mush2/shared";
import { BottomNav, type MobilePanel } from "./hud/BottomNav.tsx";
import { InspectPanel } from "./hud/InspectPanel.tsx";
import { ITrackie } from "./hud/ITrackie.tsx";
import { PeekBar } from "./hud/PeekBar.tsx";
import { SelfPanel } from "./hud/SelfPanel.tsx";
import { resolveTarget } from "./hud/targets.ts";
import { TopBar } from "./hud/TopBar.tsx";
import { gameSocket, type SeatTicket } from "./net.ts";
import { IsoRoom, type Occupant } from "./iso/IsoRoom.tsx";
import { useShipLayout } from "./iso/shipLayout.ts";
import { useFogDepth } from "./fogDepth.ts";
import { useMobile } from "./useMobile.ts";

export function GameScreen({ ticket, onLeave }: { ticket: SeatTicket; onLeave: () => void }) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [cheatsAllowed, setCheatsAllowed] = useState(false);
  const [error, setError] = useState("");
  const socketRef = useRef<PartySocket | null>(null);
  const layout = useShipLayout();
  /** UI-only state: what the inspect panel shows. Null means yourself. */
  const [selected, setSelected] = useState<Target | null>(null);
  // Phone layout only: which panel is on screen, and a door tapped in the room.
  const mobile = useMobile();
  const fogDepth = useFogDepth();
  const [panel, setPanel] = useState<MobilePanel>("room");
  const [roomLogRequest, setRoomLogRequest] = useState(0);
  const [peekDoor, setPeekDoor] = useState<RoomId | null>(null);
  const here = view?.you.room;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `here` is a trigger: arriving somewhere new clears the door peek.
  useEffect(() => setPeekDoor(null), [here]);

  // Desktop: pressing anywhere outside the inspect panel resets it to yourself. This runs on pointerdown,
  // before the click that selects something new, so clicking a person or item still selects it.
  // The Take/Drop button of the selected item is exempt: it unmounts if the selection is cleared first.
  // Not on a phone: there the peek bar's "More" sits outside the panel and needs the selection kept.
  useEffect(() => {
    if (mobile) return;
    const reset = (e: PointerEvent) => {
      if (e.target instanceof Element && !e.target.closest(".inspect, .item-action")) setSelected(null);
    };
    document.addEventListener("pointerdown", reset);
    return () => document.removeEventListener("pointerdown", reset);
  }, [mobile]);

  useEffect(() => {
    const socket = gameSocket(ticket.roomId, ticket.token);
    socketRef.current = socket;
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as GameServerMessage;
      if (msg.type === "view") {
        setView(msg.view);
        setCheatsAllowed(msg.cheatsAllowed);
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
  // Acting shows its result in the iTrackie's Room log tab; the phone's bottom nav stays where it is.
  const send = (action: Action) => {
    post({ type: "action", action });
    setRoomLogRequest((n) => n + 1);
  };

  if (!view) return <main className="connecting loading">Connecting…</main>;
  const { you } = view;
  const reachable = new Set(view.legalActions.flatMap((a) => (a.type === "move" ? [a.to] : [])));
  const occupant = (p: { id: string; name: string; isBot: boolean; character: CharacterId }): Occupant => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    character: p.character,
    you: p.id === you.id,
  });
  // Where the view places other people outside your room (everyone with ACTOPI on, nobody with it off).
  const nearby: Partial<Record<RoomId, Occupant[]>> = {};
  for (const p of view.players) if (p.room !== undefined && p.room !== you.room) (nearby[p.room] ??= []).push(occupant(p));
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
        showSummary={mobile}
        canReady={view.legalActions.some((a) => a.type === "ready")}
        onReady={() => send({ type: "ready" })}
        onLeave={onLeave}
        cheatsAllowed={cheatsAllowed}
        onCheat={(cheat: Cheat, on: boolean) => post({ type: "cheat", cheat, on })}
        onActopiCheat={(mode: ActopiCheat) => post({ type: "actopiCheat", mode })}
      />
      {error && <p className="error">{error}</p>}

      <div className="three-panel" data-panel={panel}>
        <div className="left-column">
          <InspectPanel view={view} target={target} onAction={send} />
          {mobile && (
            <SelfPanel view={view} selected={target} showSummary={false} onAction={send} onSelect={select} />
          )}
        </div>

        <div className="world">
          <div className="room-view">
            {layout ? (
              <IsoRoom
                layout={layout}
                room={you.room}
                occupants={[you, ...view.players.filter((p) => p.room === you.room)]
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map(occupant)}
                nearby={nearby}
                fogDepth={fogDepth}
                equipment={view.roomEquipment}
                reachable={reachable}
                selected={target}
                selectedDoor={peekDoor}
                onMove={move}
                onSelect={select}
                onClear={() => select(null)}
                onDoorTap={tapDoor}
              />
            ) : (
              <section className="iso-room loading">Loading ship…</section>
            )}
            {/* TODO(minimap): stubbed out for now, to be revisited. scene/Minimap.tsx still exists; render it here
                with here={you.room} youId={you.id} people={[you, ...view.players]} unidentified={view.unidentified}
                reachable={reachable} onMove={move}. */}
          </div>
          {!mobile && (
            <SelfPanel view={view} selected={target} showSummary onAction={send} onSelect={select} />
          )}
        </div>

        <ITrackie
          view={view}
          roomLogRequest={roomLogRequest}
          onChat={(channel, text) => post({ type: "chat", channel, text })}
          channels={{
            onCreate: (name) => post({ type: "createChannel", name }),
            onInvite: (channel, player) => post({ type: "invite", channel, player }),
            onLeave: (channel) => post({ type: "leaveChannel", channel }),
          }}
        />
      </div>

      {mobile && panel === "room" && (
        <PeekBar
          view={view}
          target={target}
          door={peekDoor}
          reachable={reachable}
          onAction={send}
          onMove={move}
          onMore={() => setPanel("inspect")}
        />
      )}
      {mobile && <BottomNav panel={panel} onChange={setPanel} />}
    </main>
  );
}
