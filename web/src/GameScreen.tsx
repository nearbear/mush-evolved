// Thin view layer: renders a PlayerView and emits intents. No game logic here;
// the server decides what is legal and sends it in view.actions.

import { useEffect, useRef, useState } from "react";
import type PartySocket from "partysocket";
import { CORPSE_ITEM, MAX_CHAT_LENGTH, MAX_CHAT_LINES, legalIn, type Action, type ActopiCheat, type BotPause, type CharacterId, type Cheat, type GameClientMessage, type GameServerMessage, type PlayerView, type RoleCheat, type RoomId, type Spot, type Target } from "@mush2/shared";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { ActionQueue } from "./hud/ActionQueue.tsx";
import { BottomNav, type MobilePanel } from "./hud/BottomNav.tsx";
import { DeathNotice } from "./hud/DeathNotice.tsx";
import { Credits } from "./hud/Credits.tsx";
import { RoomList } from "./hud/RoomList.tsx";
import { InspectPanel } from "./hud/InspectPanel.tsx";
import { InventoryOverlay, stepZoom } from "./hud/InventoryOverlay.tsx";
import { ShipOverlay } from "./hud/ShipOverlay.tsx";
import { Announcer } from "./hud/Announcer.tsx";
import { ITrackie } from "./hud/ITrackie.tsx";
import { PatrolCockpit } from "./hud/PatrolCockpit.tsx";
import { PeekBar } from "./hud/PeekBar.tsx";
import { TerminalDialog } from "./hud/TerminalDialog.tsx";
import { EndScreen } from "./hud/EndScreen.tsx";
import { BodyTakenDialog } from "./hud/BodyTakenDialog.tsx";
import { SelfPanel } from "./hud/SelfPanel.tsx";
import { resolveTarget } from "./hud/targets.ts";
import { TopBar } from "./hud/TopBar.tsx";
import { gameSocket, type SeatTicket } from "./net.ts";
import { shipPace, type Corpse, type Occupant } from "./iso/scene.ts";
import { LeavingIsoRoom } from "./iso/LeavingRoom.tsx";
import { recentDoorMoves } from "./iso/doorMoves.ts";
import { useShipLayout } from "./iso/shipLayout.ts";
import { useActingOn } from "./iso/useActingOn.ts";
import { useFogDepth } from "./fogDepth.ts";
import { ROOM_RENDERER } from "./rendererChoice.ts";
import { useSpeechBubbles } from "./scene/useSpeechBubbles.ts";
import type { Bar } from "./scene/ActionBar.tsx";
import { WakeUpAnnouncement } from "./WakeUp.tsx";
import { useNames } from "./i18n/names.ts";
import { showError } from "./Toasts.tsx";
import { useMobile } from "./useMobile.ts";

const NO_CHAT: PlayerView["chat"] = [];

export function GameScreen({ ticket, onLeave, waking = false }: { ticket: SeatTicket; onLeave: () => void; waking?: boolean }) {
  const { t } = useTranslation();
  const [view, setView] = useState<PlayerView | null>(null);
  const [cheatsAllowed, setCheatsAllowed] = useState(false);
  /** Server clock minus ours, from each view message, so action bars (server ms) drain at the right moment. */
  const [clockOffset, setClockOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [nextCycleAt, setNextCycleAt] = useState<number | null>(null);
  const [botsPaused, setBotsPaused] = useState<BotPause | null>(null);
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
  // The end screen opens by itself when the game ends (and after a reload); closing it lets you look around.
  const [endClosed, setEndClosed] = useState(false);
  const [peekDoor, setPeekDoor] = useState<RoomId | null>(null);
  // Bumped when the room list selects something, to move focus to where its actions are (a screen reader's next step).
  const [focusActions, setFocusActions] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focusActions` is a trigger, read from the DOM once the selection has rendered.
  useEffect(() => {
    if (!focusActions) return;
    const panel = document.querySelector<HTMLElement>(mobile ? ".peek-bar" : ".inspect");
    const first = panel?.querySelector<HTMLElement>(mobile ? ".peek-actions button:not([inert])" : ".inspect-actions button");
    (first ?? panel)?.focus();
  }, [focusActions]);
  const here = view?.you.room;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `here` is a trigger: arriving somewhere new clears the door peek.
  useEffect(() => setPeekDoor(null), [here]);
  const body = view?.you.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `body` is a trigger: a Transfer moves you to another body, so a selection made from the old one is dropped.
  useEffect(() => {
    setSelected(null);
    setPeekDoor(null);
    setTerminalId(null);
  }, [body]);

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
        setNextCycleAt(msg.nextCycleAt);
        setBotsPaused(msg.botsPaused);
      } else showError(i18n.t(`errors.${msg.message}` as never, { defaultValue: msg.message, max: MAX_CHAT_LENGTH, lines: MAX_CHAT_LINES }));
    });
    // 4001 = invalid seat token (e.g. the local server was restarted).
    socket.addEventListener("close", (e: CloseEvent) => {
      if (e.code === 4001) onLeave();
    });
    return () => socket.close();
  }, [ticket, onLeave]);

  const post = (msg: GameClientMessage) => socketRef.current?.send(JSON.stringify(msg));
  // You walk up to whatever your action is on, when it starts (cosmetic; see useActingOn).
  const { actingOn, sentCount, sent } = useActingOn(view?.you);
  // Acting shows its result in the iTrackie's Room log tab; the phone's bottom nav stays where it is.
  const send = (action: Action) => {
    post({ type: "action", action });
    sent(action);
    if (action.type === "access") setTerminalId(action.equipment);
    setRoomLogRequest((n) => n + 1);
  };

  const bubbles = useSpeechBubbles(view?.chat ?? NO_CHAT);

  if (!view) return <main className="connecting loading">{t("common.connecting")}</main>;
  const { you } = view;
  const reachable = new Set(legalIn(view).flatMap((a) => (a.type === "move" ? [a.to] : [])));
  const occupant = (p: { id: string; isBot: boolean; character: CharacterId; statuses: string[]; busy?: Bar; lying?: string; spot?: Spot; pushedBy?: string }): Occupant => {
    const busy = p.id === you.id && you.current ? { bar: you.current, label: names.action(you.current.action.type) } : p.busy && { bar: p.busy };
    return {
      id: p.id,
      name: names.character(p.character),
      isBot: p.isBot,
      character: p.character,
      you: p.id === you.id,
      ...((p.id === you.id ? you.lyingIn : p.lying) && { lying: p.id === you.id ? you.lyingIn : p.lying }),
      ...(p.spot && { spot: p.spot }),
      ...(p.pushedBy !== undefined && { pushedBy: p.pushedBy }),
      statuses: p.id === you.id ? view.statuses : p.statuses,
      ...(busy && { busy }),
    };
  };
  // Where the view places other people outside your room (everyone with ACTOPI on, nobody with it off).
  const nearby: Partial<Record<RoomId, Occupant[]>> = {};
  for (const p of view.players) if (p.room !== undefined && p.room !== you.room) (nearby[p.room] ??= []).push(occupant(p));
  // Who just came in or went out, and through which door (they walk through it).
  const doorMoves = recentDoorMoves(view.log, view.players, Date.now() + clockOffset);
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
      <Announcer />
      <WakeUpAnnouncement waking={waking} text={t("wake.ready", { day: view.day, cycle: view.cycleOfDay, room: names.room(you.room) })} />
      <TerminalDialog terminal={terminal} view={view} onAction={send} onClose={() => setTerminalId(null)} />
      <EndScreen view={view} open={view.phase === "ended" && !endClosed} onOpenChange={(open) => setEndClosed(!open)} />
      <BodyTakenDialog view={view} onAcknowledge={() => post({ type: "acknowledgeTransfer" })} />
      <TopBar
        view={view}
        showSummary={mobile}
        canReady={legalIn(view).some((a) => a.type === "ready")}
        nextCycleAt={nextCycleAt}
        botsPaused={botsPaused}
        clockOffset={clockOffset}
        onReady={() => send({ type: "ready" })}
        onLeave={onLeave}
        onResults={() => setEndClosed(false)}
        cheatsAllowed={cheatsAllowed}
        onCheat={(cheat: Cheat, on: boolean) => post({ type: "cheat", cheat, on })}
        onActopiCheat={(mode: ActopiCheat) => post({ type: "actopiCheat", mode })}
        onRoleCheat={(role: RoleCheat) => post({ type: "roleCheat", role })}
      />

      <div className="three-panel" data-panel={panel}>
        <div className="left-column">
          <InspectPanel view={view} layout={layout} target={target} onAction={send} />
        </div>

        <div className="world">
          <div className="room-view">
            {!you.alive ? (
              <DeathNotice view={view} />
            ) : view.patrolShip ? (
              <PatrolCockpit view={view} ship={view.patrolShip} selected={target} onSelect={select} />
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
                renderer={ROOM_RENDERER}
                zoom={zoom}
                onZoomStep={(dir) => setZoom((z) => stepZoom(z, dir) ?? z)}
                equipment={view.roomEquipment}
                reachable={reachable}
                selected={target}
                selectedDoor={peekDoor}
                actingOn={actingOn}
                sentCount={sentCount}
                teleport={you.cheats.includes("instantActions")}
                doorMoves={doorMoves}
                onMove={move}
                onWalk={(cell, sitting, behind) => view.config.sharedSpots && post({ type: "walk", x: cell.x, y: cell.y, sitting, ...(behind && { behind }) })}
                onSelect={select}
                onClear={() => select(null)}
                onDoorTap={tapDoor}
                bubbles={bubbles}
                clockOffset={clockOffset}
                pilgredRepaired={view.pilgredRepaired}
                pace={shipPace(view.navigation)}
              />
            ) : (
              <section className="iso-room loading">{t("common.loadingShip")}</section>
            )}
            {you.alive && <RoomList view={view} layout={layout} reachable={reachable} onSelect={(target) => { select(target); setFocusActions((n) => n + 1); }} onMove={move} />}
            {you.alive && <ActionQueue view={view} onClear={() => post({ type: "clearQueue" })} />}
            {mobile && <ShipOverlay view={view} />}
            {you.alive && <InventoryOverlay view={view} selected={target} onAction={send} onSelect={select} zoom={zoom} onZoom={setZoom} />}
            {/* TODO(minimap): stubbed out for now, to be revisited. scene/Minimap.tsx still exists; render it here
                with here={you.room} youId={you.id} people={[you, ...view.players]} unidentified={view.unidentified}
                reachable={reachable} onMove={move}. */}
          </div>
          {!mobile && (
            <SelfPanel view={view} />
          )}
        </div>

        <ITrackie
          view={view}
          roomLogRequest={roomLogRequest}
          onChat={(channel, text) => post({ type: "chat", channel, text })}
          onCreateThread={(name, from) => post(from === undefined ? { type: "createThread", name } : { type: "createThread", name, from })}
          onToggle={(message, line) => post({ type: "toggleCheckbox", message, line })}
          channels={{
            onCreate: (name, members) => post({ type: "createChannel", name, members }),
            onInvite: (channel, player) => post({ type: "invite", channel, player }),
            onLeave: (channel) => post({ type: "leaveChannel", channel }),
          }}
        />

        {/* Last in the tab order (not inside the Inspect aside), so keyboard users don't tab through it mid-game. On desktop it sits under the world column (the player panel) only; CSS places it. */}
        {!mobile && <Credits className="game-credits" />}
      </div>

      {/* On phones it shows on the Inspect tab only, below the panels. */}
      {mobile && panel === "inspect" && <Credits className="game-credits" />}

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
