// Thin view layer: renders a PlayerView and emits intents. No game logic here;
// the server decides what is legal and sends it in view.legalActions.

import { useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import { CORPSE_ITEM, type Action, type ActopiCheat, type CharacterId, type Cheat, type GameClientMessage, type GameServerMessage, type PlayerView, type RoleCheat, type RoomId, type Target } from "@mush2/shared";
import i18n from "i18next";
import { ActionQueue } from "./hud/ActionQueue.tsx";
import { BottomNav, type MobilePanel } from "./hud/BottomNav.tsx";
import { DeathNotice } from "./hud/DeathNotice.tsx";
import { InspectPanel } from "./hud/InspectPanel.tsx";
import { InventoryOverlay } from "./hud/InventoryOverlay.tsx";
import { ITrackie } from "./hud/ITrackie.tsx";
import { PeekBar } from "./hud/PeekBar.tsx";
import { TerminalDialog } from "./hud/TerminalDialog.tsx";
import { SelfPanel } from "./hud/SelfPanel.tsx";
import { resolveTarget } from "./hud/targets.ts";
import { TopBar } from "./hud/TopBar.tsx";
import { gameSocket, type SeatTicket } from "./net.ts";
import type { Corpse, Occupant } from "./iso/IsoRoom.tsx";
import { LeavingIsoRoom } from "./iso/LeavingRoom.tsx";
import { useShipLayout } from "./iso/shipLayout.ts";
import { useActingOn } from "./iso/useActingOn.ts";
import { useFogDepth } from "./fogDepth.ts";
import { useSpeechBubbles } from "./scene/useSpeechBubbles.ts";
import type { Bar } from "./scene/ActionBar.tsx";
import { useNames } from "./i18n/names.ts";
import { showError } from "./Toasts.tsx";
import { useMobile } from "./useMobile.ts";

const NO_CHAT: PlayerView["chat"] = [];

export function GameScreen({ ticket, onLeave }: { ticket: SeatTicket; onLeave: () => void }) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [cheatsAllowed, setCheatsAllowed] = useState(false);
  /** Server clock minus ours, from each view message, so action bars (server ms) drain at the right moment. */
  const [clockOffset, setClockOffset] = useState(0);
  const names = useNames();
  const socketRef = useRef<PartySocket | null>(null);
  const layout = useShipLayout();
  /** UI-only state: what the inspect panel shows. Null means yourself. */
  const [selected, setSelected] = useState<Target | null>(null);
  // Phone layout only: which panel is on screen, and a door tapped in the room.
  const mobile = useMobile();
  const fogDepth = useFogDepth();
  const [panel, setPanel] = useState<MobilePanel>("room");
  const [roomLogRequest, setRoomLogRequest] = useState(0);
  /** Equipment id of the terminal window that is open, if any. UI-only. */
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [peekDoor, setPeekDoor] = useState<RoomId | null>(null);
  const here = view?.you.room;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `here` is a trigger: arriving somewhere new clears the door peek.
  useEffect(() => setPeekDoor(null), [here]);

  // Desktop: clicking anywhere outside the inspect panel resets it to yourself. This runs on the document's
  // click, after React's handlers, so a click that selects something (person, item, equipment, door) sets
  // `selectedByThisClick` and is left alone. Resetting earlier, on pointerdown, flashed the portrait first.
  // Not on a phone: there the peek bar's "More" sits outside the panel and needs the selection kept.
  const selectedByThisClick = useRef(false);
  const markSelected = () => {
    selectedByThisClick.current = true;
    setTimeout(() => {
      selectedByThisClick.current = false; // after the click has finished dispatching
    }, 0);
  };
  useEffect(() => {
    if (mobile) return;
    const reset = (e: MouseEvent) => {
      if (selectedByThisClick.current) return;
      if (e.target instanceof Element && !e.target.closest(".inspect")) setSelected(null);
    };
    document.addEventListener("click", reset);
    return () => document.removeEventListener("click", reset);
  }, [mobile]);

  useEffect(() => {
    const socket = gameSocket(ticket.roomId, ticket.token);
    socketRef.current = socket;
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as GameServerMessage;
      if (msg.type === "view") {
        setView(msg.view);
        setCheatsAllowed(msg.cheatsAllowed);
        setClockOffset(msg.now - Date.now());
      } else showError(i18n.t(`errors.${msg.message}` as never, { defaultValue: msg.message }));
    });
    // 4001 = invalid seat token (e.g. the local server was restarted).
    socket.addEventListener("close", (e: CloseEvent) => {
      if (e.code === 4001) onLeave();
    });
    return () => socket.close();
  }, [ticket, onLeave]);

  const post = (msg: GameClientMessage) => socketRef.current?.send(JSON.stringify(msg));
  // You walk up to whatever your action is on, when it starts (cosmetic; see useActingOn).
  const { actingOn, sent } = useActingOn(view?.you);
  // Acting shows its result in the iTrackie's Room log tab; the phone's bottom nav stays where it is.
  const send = (action: Action) => {
    post({ type: "action", action });
    sent(action);
    if (action.type === "access") setTerminalId(action.equipment);
    setRoomLogRequest((n) => n + 1);
  };

  const bubbles = useSpeechBubbles(view?.chat ?? NO_CHAT);

  if (!view) return <main className="connecting loading">Connecting…</main>;
  const { you } = view;
  const reachable = new Set(view.legalActions.flatMap((a) => (a.type === "move" ? [a.to] : [])));
  const occupant = (p: { id: string; isBot: boolean; character: CharacterId; statuses: string[]; busy?: Bar; lying?: string }): Occupant => {
    const busy = p.id === you.id && you.current ? { bar: you.current, label: names.action(you.current.action.type) } : p.busy && { bar: p.busy };
    return {
      id: p.id,
      name: names.character(p.character),
      isBot: p.isBot,
      character: p.character,
      you: p.id === you.id,
      ...((p.id === you.id ? you.lyingIn : p.lying) && { lying: p.id === you.id ? you.lyingIn : p.lying }),
      statuses: p.id === you.id ? view.statuses : p.statuses,
      ...(busy && { busy }),
    };
  };
  // Where the view places other people outside your room (everyone with ACTOPI on, nobody with it off).
  const nearby: Partial<Record<RoomId, Occupant[]>> = {};
  for (const p of view.players) if (p.room !== undefined && p.room !== you.room) (nearby[p.room] ??= []).push(occupant(p));
  // Corpses on the floor here, drawn lying down. Whose body each is comes from the view (`ItemView.of`).
  const corpses: Corpse[] = view.roomItems
    .filter((i) => i.type === CORPSE_ITEM)
    .map((i) => ({ id: i.id, character: [you, ...view.players].find((p) => p.id === i.of)?.character }));
  const move = (to: string) => send({ type: "move", to });
  const select = (t: Target | null) => {
    markSelected();
    setSelected(t);
    setPeekDoor(null);
  };
  const tapDoor = (to: RoomId) => {
    markSelected();
    setSelected(null);
    setPeekDoor(to);
  };
  // Fall back to yourself when nothing is selected or the selection is gone (left the room, item moved away).
  const target: Target = selected && resolveTarget(view, selected) ? selected : { kind: "player", id: you.id };

  const terminal = terminalId ? view.roomEquipment.find((e) => e.id === terminalId) ?? null : null;

  return (
    <main className="game">
      <TerminalDialog terminal={terminal} view={view} onAction={send} onClose={() => setTerminalId(null)} />
      <TopBar
        view={view}
        showSummary={mobile}
        canReady={view.legalActions.some((a) => a.type === "ready")}
        onReady={() => send({ type: "ready" })}
        onLeave={onLeave}
        cheatsAllowed={cheatsAllowed}
        onCheat={(cheat: Cheat, on: boolean) => post({ type: "cheat", cheat, on })}
        onActopiCheat={(mode: ActopiCheat) => post({ type: "actopiCheat", mode })}
        onRoleCheat={(role: RoleCheat) => post({ type: "roleCheat", role })}
      />

      <div className="three-panel" data-panel={panel}>
        <div className="left-column">
          <InspectPanel view={view} layout={layout} target={target} onAction={send} />
          {mobile && (
            <SelfPanel view={view} showSummary={false} />
          )}
        </div>

        <div className="world">
          <div className="room-view">
            {!you.alive ? (
              <DeathNotice view={view} />
            ) : layout ? (
              <LeavingIsoRoom
                layout={layout}
                room={you.room}
                occupants={[you, ...view.players.filter((p) => p.room === you.room)]
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map(occupant)}
                nearby={nearby}
                corpses={corpses}
                fogDepth={fogDepth}
                equipment={view.roomEquipment}
                reachable={reachable}
                selected={target}
                selectedDoor={peekDoor}
                actingOn={actingOn}
                teleport={you.cheats.includes("instantActions")}
                onMove={move}
                onSelect={select}
                onClear={() => select(null)}
                onDoorTap={tapDoor}
                bubbles={bubbles}
                clockOffset={clockOffset}
              />
            ) : (
              <section className="iso-room loading">Loading ship…</section>
            )}
            {you.alive && <ActionQueue view={view} onClear={() => post({ type: "clearQueue" })} />}
            {you.alive && <InventoryOverlay view={view} selected={target} onAction={send} onSelect={select} />}
            {/* TODO(minimap): stubbed out for now, to be revisited. scene/Minimap.tsx still exists; render it here
                with here={you.room} youId={you.id} people={[you, ...view.players]} unidentified={view.unidentified}
                reachable={reachable} onMove={move}. */}
          </div>
          {!mobile && (
            <SelfPanel view={view} showSummary />
          )}
        </div>

        <ITrackie
          view={view}
          roomLogRequest={roomLogRequest}
          onChat={(channel, text) => post({ type: "chat", channel, text })}
          onToggle={(message, line) => post({ type: "toggleCheckbox", message, line })}
          channels={{
            onCreate: (name) => post({ type: "createChannel", name }),
            onInvite: (channel, player) => post({ type: "invite", channel, player }),
            onLeave: (channel) => post({ type: "leaveChannel", channel }),
          }}
        />
      </div>

      {mobile && panel === "room" && you.alive && (
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
