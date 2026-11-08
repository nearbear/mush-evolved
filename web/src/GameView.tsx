// Thin view layer: renders a PlayerView and emits intents. No game logic here;
// the server decides what is legal and sends it in view.actions. No socket either: see GameScreen.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CORPSE_ITEM, legalIn, type Action, type BotPause, type CharacterId, type Cheat, type GameClientMessage, type PlayerView, type RoleCheat, type RoomId, type Spot, type Target } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { ActionQueue } from "./hud/ActionQueue.tsx";
import { BottomNav, type MobilePanel } from "./hud/BottomNav.tsx";
import { DeathNotice } from "./hud/DeathNotice.tsx";
import { RoomList } from "./hud/RoomList.tsx";
import { InspectPanel } from "./hud/InspectPanel.tsx";
import { InventoryOverlay, stepZoom } from "./hud/InventoryOverlay.tsx";
import { ShipOverlay } from "./hud/ShipOverlay.tsx";
import { Announcer } from "./hud/Announcer.tsx";
import { ITrackie } from "./hud/ITrackie.tsx";
import { PatrolCockpit } from "./hud/PatrolCockpit.tsx";
import { IcarusPanel } from "./hud/IcarusPanel.tsx";
import { PeekBar } from "./hud/PeekBar.tsx";
import { TerminalDialog } from "./hud/TerminalDialog.tsx";
import { EndScreen } from "./hud/EndScreen.tsx";
import { BodyTakenDialog } from "./hud/BodyTakenDialog.tsx";
import { SelfHud, SelfPoints } from "./hud/SelfHud.tsx";
import { TipCard } from "./hud/TipCard.tsx";
import { resolveTarget } from "./hud/targets.ts";
import { TopBar } from "./hud/TopBar.tsx";
import { ServerClockContext, serverTime, type ServerClock } from "./hud/serverClock.ts";
import { shipPace, type Corpse, type Occupant } from "./iso/scene.ts";
import { FIRE_ICON, orbitImage } from "./art/assets.ts";
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
import { Minimap } from "./scene/Minimap.tsx";
import { useMobile } from "./useMobile.ts";

export interface GameViewProps {
  view: PlayerView;
  /** Sends one message to the server. Absent in a read-only view (a replay): every intent is hidden or inert. */
  send?: ((msg: GameClientMessage) => void) | undefined;
  /** Back to the main menu. Navigation, not a game intent, so a replay has it too. */
  onLeave: () => void;
  /** Plays the screen-reader wake-up line (a fresh join from the lobby). */
  waking?: boolean;
  cheatsAllowed?: boolean;
  /** The server's clock for countdowns and action bars: live, an offset from ours; in a replay, frozen at the step. */
  clock?: ServerClock;
  nextCycleAt?: number | null;
  botsPaused?: BotPause | null;
  /** Playback controls (a replay): under the top bar on desktop, above the bottom nav on a phone, on every tab. */
  transport?: ReactNode;
  /**
   * Nobody walks into place this render: everyone, you included, jumps there, and leaving a room switches at once.
   * A replay sets it on any move that isn't a single step forward (a step back, a cycle jump, a seek).
   */
  snapWalks?: boolean;
}

const LIVE: ServerClock = { offset: 0 };
const NO_DOOR_MOVES: ReadonlyMap<string, { from?: RoomId; to?: RoomId }> = new Map();

/**
 * The game screen without a socket: renders a `PlayerView` and turns clicks into intents through `send`. GameScreen
 * feeds it a live game; a replay can feed it recorded views with no `send`.
 */
export function GameView({ view: given, send, onLeave, waking = false, cheatsAllowed = false, clock = LIVE, nextCycleAt = null, botsPaused = null, transport, snapWalks = false }: GameViewProps) {
  const { t } = useTranslation();
  // Read-only, the view grants nothing: no actions (so no action buttons, Ready or Go) and no channel to post in
  // (so every thread shows as read-only, as it does for the dead). Taking things away is not deciding legality.
  const readOnly = !send;
  const view = useMemo(() => (readOnly ? { ...given, actions: [], chatChannels: [] } : given), [given, readOnly]);
  const post = (msg: GameClientMessage) => send?.(msg);
  const [zoom, setZoom] = useState(1);
  const names = useNames();
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
  const here = view.you.room;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `here` is a trigger: arriving somewhere new clears the door peek.
  useEffect(() => setPeekDoor(null), [here]);
  const body = view.you.id;
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

  // You walk up to whatever your action is on, when it starts (cosmetic; see useActingOn).
  const { actingOn, sentCount, sent } = useActingOn(view.you);
  // Acting shows its result in the iTrackie's Room log tab; the phone's bottom nav stays where it is.
  const act = (action: Action) => {
    if (readOnly) return;
    post({ type: "action", action });
    sent(action);
    if (action.type === "access") setTerminalId(action.equipment);
    setRoomLogRequest((n) => n + 1);
  };

  const bubbles = useSpeechBubbles(view.chat);

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
  // Who just came in or went out, and through which door (they walk through it). Nobody, when snapping.
  const doorMoves = snapWalks ? NO_DOOR_MOVES : recentDoorMoves(view.log, view.players, serverTime(clock, Date.now()));
  // Corpses on the floor here, drawn lying down. Whose body each is comes from the view (`ItemView.of`).
  const corpses: Corpse[] = view.roomItems
    .filter((i) => i.type === CORPSE_ITEM)
    .map((i) => ({ id: i.id, character: [you, ...view.players].find((p) => p.id === i.of)?.character }));
  const move = (to: string) => act({ type: "move", to });
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
    <ServerClockContext.Provider value={clock}>
    <main className="game">
      <Announcer />
      <WakeUpAnnouncement waking={waking} text={t("wake.ready", { day: view.day, cycle: view.cycleOfDay, room: names.room(you.room) })} />
      <TerminalDialog terminal={terminal} view={view} onAction={act} onClose={() => setTerminalId(null)} onSharePlanet={(planet, text) => post({ type: "sharePlanet", planet, text })} />
      <EndScreen view={view} open={view.phase === "ended" && !endClosed} onOpenChange={(open) => setEndClosed(!open)} />
      {!readOnly && <BodyTakenDialog view={view} onAcknowledge={() => post({ type: "acknowledgeTransfer" })} />}
      <TopBar
        view={view}
        showSummary={mobile}
        canReady={legalIn(view).some((a) => a.type === "ready")}
        nextCycleAt={nextCycleAt}
        botsPaused={botsPaused}
       
        onReady={() => act({ type: "ready" })}
        onLeave={onLeave}
        onResults={() => setEndClosed(false)}
        cheatsAllowed={cheatsAllowed && !readOnly}
        onCheat={(cheat: Cheat, on: boolean) => post({ type: "cheat", cheat, on })}
        onRoleCheat={(role: RoleCheat) => post({ type: "roleCheat", role })}
        onLeaveShip={() => post({ type: "leaveShip" })}
      />
      {!mobile && transport && <div className="game-transport">{transport}</div>}

      <div className="three-panel" data-panel={panel}>
        <div className="left-column">
          <InspectPanel view={view} layout={layout} target={target} onAction={act} onDeselect={selected && target === selected ? () => select(null) : undefined} />
        </div>

        <div className="world">
          <div className="room-view">
            {!you.alive ? (
              <DeathNotice view={view} />
            ) : view.patrolShip ? (
              <PatrolCockpit view={view} ship={view.patrolShip} selected={target} onSelect={select} onAction={act} />
            ) : view.expedition?.report !== undefined ? (
              <IcarusPanel view={view} expedition={view.expedition} selected={target} onSelect={select} />
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
                snap={snapWalks}
                doorMoves={doorMoves}
                onMove={move}
                onWalk={readOnly ? undefined : (cell, sitting, behind) => view.config.sharedSpots && post({ type: "walk", x: cell.x, y: cell.y, sitting, ...(behind && { behind }) })}
                onSelect={select}
                onClear={() => select(null)}
                onDoorTap={tapDoor}
                bubbles={bubbles}
               
                pilgredRepaired={view.pilgredRepaired}
                humanTankFull={view.humanTankFull}
                pace={shipPace(view.navigation)}
                planet={orbitImage(view.navigation.orbitPicture)}
                turn={view.navigation.lastTurn}
              />
            ) : (
              <section className="iso-room loading">{t("common.loadingShip")}</section>
            )}
            {view.roomOnFire && (
              <div className="room-fire" role="status">
                <img src={FIRE_ICON} alt="" /> {t("roomList.onFire")}
              </div>
            )}
            {you.alive && <RoomList view={view} layout={layout} reachable={reachable} onSelect={(target) => { select(target); setFocusActions((n) => n + 1); }} onMove={move} quiet={readOnly} />}
            {mobile && <ShipOverlay view={view} />}
            {!mobile && you.alive && <SelfHud view={view} onInspect={() => select({ kind: "player", id: you.id })} />}
            {/* Bottom-left: AP and MP (desktop), then the action queue beside them. */}
            {you.alive && (
              <div className="room-bottom-left">
                {!mobile && <SelfPoints view={view} />}
                <ActionQueue view={view} onClear={readOnly ? undefined : () => post({ type: "clearQueue" })} />
              </div>
            )}
            {you.alive && !readOnly && <TipCard view={view} />}
            {you.alive && <InventoryOverlay view={view} selected={target} onAction={act} onSelect={select} zoom={zoom} onZoom={setZoom} />}
            <Minimap
              here={you.room}
              youId={you.id}
              people={[you, ...view.players]}
              unidentified={view.unidentified}
              reachable={reachable}
              burningRooms={view.burningRooms}
            />
          </div>
        </div>

        <ITrackie
          view={view}
          roomLogRequest={roomLogRequest}
          quiet={readOnly}
          onChat={(channel, text) => post({ type: "chat", channel, text })}
          onCreateThread={(name, from) => post(from === undefined ? { type: "createThread", name } : { type: "createThread", name, from })}
          onToggle={(channel, seq, line) => post({ type: "toggleCheckbox", channel, seq, line })}
          channels={
            readOnly
              ? undefined
              : {
                  onCreate: (name, members) => post({ type: "createChannel", name, members }),
                  onInvite: (channel, player) => post({ type: "invite", channel, player }),
                  onLeave: (channel) => post({ type: "leaveChannel", channel }),
                }
          }
        />
      </div>

      {mobile && panel === "room" && you.alive && (
        <PeekBar
          view={view}
          target={target}
          door={peekDoor}
          reachable={reachable}
          onAction={act}
          onMove={move}
          onMore={() => setPanel("inspect")}
        />
      )}
      {mobile && transport && <div className="game-transport">{transport}</div>}
      {mobile && <BottomNav panel={panel} onChange={setPanel} />}
    </main>
    </ServerClockContext.Provider>
  );
}
