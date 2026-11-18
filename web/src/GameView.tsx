// Thin view layer: renders a PlayerView and emits intents. No game logic here;
// the server decides what is legal and sends it in view.actions. No socket either: see GameScreen.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CHEAT_ROOM, CORPSE_ITEM, ICARUS_CRAFT, SUPPORT_DRONE_ITEM, doorId, doorOtherRoom, isLostPlace, legalIn, type Action, type BotPause, type CharacterId, type Cheat, type GameClientMessage, type KubeOpId, type PlayerView, type RoleCheat, type RoomId, type Spot, type Target } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { Hint } from "./hud/IconButton.tsx";
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
import { LostPanel } from "./hud/LostPanel.tsx";
import { PeekBar } from "./hud/PeekBar.tsx";
import { TerminalDialog } from "./hud/TerminalDialog.tsx";
import { EndScreen } from "./hud/EndScreen.tsx";
import { BodyTakenDialog } from "./hud/BodyTakenDialog.tsx";
import { SelfHud } from "./hud/SelfHud.tsx";
import { TipCard } from "./hud/TipCard.tsx";
import { resolveTarget } from "./hud/targets.ts";
import { TopBar } from "./hud/TopBar.tsx";
import { ServerClockContext, serverTime, type ServerClock } from "./hud/serverClock.ts";
import { shipPace, type Corpse, type Drone, type Occupant } from "./iso/scene.ts";
import { FIRE_ICON, orbitImage, skillIcon } from "./art/assets.ts";
import { LeavingIsoRoom } from "./iso/LeavingRoom.tsx";
import { recentDoorMoves } from "./iso/doorMoves.ts";
import { useCheatRoom, useShipLayout } from "./iso/shipLayout.ts";
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
  /** The game's room, for the end screen's "Watch the replay" link (live only). */
  replayId?: string | undefined;
}

const LIVE: ServerClock = { offset: 0 };
const NO_DOOR_MOVES: ReadonlyMap<string, { from?: RoomId; to?: RoomId }> = new Map();

/**
 * The game screen without a socket: renders a `PlayerView` and turns clicks into intents through `send`. GameScreen
 * feeds it a live game; a replay can feed it recorded views with no `send`.
 */
export function GameView({ view: given, send, onLeave, waking = false, cheatsAllowed = false, clock = LIVE, nextCycleAt = null, botsPaused = null, transport, snapWalks = false, replayId }: GameViewProps) {
  const { t } = useTranslation();
  // Read-only, the view grants nothing: no actions (so no action buttons, Ready or Go) and no channel to post in
  // (so every thread shows as read-only, as it does for the dead). Taking things away is not deciding legality.
  const readOnly = !send;
  const view = useMemo(() => (readOnly ? { ...given, actions: [], chatChannels: [] } : given), [given, readOnly]);
  const post = (msg: GameClientMessage) => send?.(msg);
  const [zoom, setZoom] = useState(1);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const names = useNames();
  const layout = useCheatRoom(useShipLayout(), view.you.room === CHEAT_ROOM);
  const roomTitleId = useId();
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
  // A replay stepping back from the end reopens it for the next time the end comes (the derived-state pattern).
  const [endClosed, setEndClosed] = useState(false);
  if (endClosed && view.phase !== "ended") setEndClosed(false);
  // A door's id is the same from both sides, so arriving in a new room clears any selected door instead of
  // keeping "Door to <the room you left>" selected.
  const [lastRoom, setLastRoom] = useState(view.you.room);
  if (lastRoom !== view.you.room) {
    setLastRoom(view.you.room);
    if (selected?.kind === "door") setSelected(null);
  }
  // Bumped when the room list selects something, to move focus to where its actions are (a screen reader's next step).
  const [focusActions, setFocusActions] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focusActions` is a trigger, read from the DOM once the selection has rendered.
  useEffect(() => {
    if (!focusActions) return;
    const panel = document.querySelector<HTMLElement>(mobile ? ".peek-bar" : ".inspect");
    const first = panel?.querySelector<HTMLElement>(mobile ? ".peek-actions button:not([inert])" : ".inspect-actions button");
    (first ?? panel)?.focus();
  }, [focusActions]);
  const body = view.you.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `body` is a trigger: a Transfer moves you to another body, so a selection made from the old one is dropped.
  useEffect(() => {
    setSelected(null);
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
      // A window opened from the panel (the Superkube, a document) is portaled outside it; clicks inside it count as inside.
      if (e.target instanceof Element && !e.target.closest(".inspect, [role='dialog']")) setSelected(null);
    };
    document.addEventListener("click", reset);
    return () => document.removeEventListener("click", reset);
  }, [mobile]);

  // You walk up to whatever your action is on, when it starts (cosmetic; see useActingOn).
  const { actingOn, sentCount, sent } = useActingOn(view.you, view.statuses);
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
  // Away with an expedition, or aboard the docked Icarus (owner, 2026-11-17): both show the Icarus panel.
  const inIcarus = view.expedition?.report !== undefined || you.room === ICARUS_CRAFT;
  /** The room view shows your room's scene (not death, the patrol cockpit, a lost place or Icarus), so it gets the name plate. */
  const inRoom = you.alive && !(view.patrolShip && view.expedition?.report === undefined) && !isLostPlace(you.room) && !inIcarus;
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
  // Support drones on the floor here (#411), floating over their shadows.
  const drones: Drone[] = view.roomItems.filter((i) => i.type === SUPPORT_DRONE_ITEM).map((i) => ({ id: i.id }));
  const move = (to: string) => act({ type: "move", to });
  const select = (t: Target | null) => {
    markSelected();
    setSelected(t);
  };
  const tapDoor = (to: RoomId) => select({ kind: "door", id: doorId(you.room, to) });
  // Fall back to yourself when nothing is selected or the selection is gone (left the room, item moved away).
  const target: Target = selected && resolveTarget(view, selected) ? selected : { kind: "player", id: you.id };
  const selectedDoor = target.kind === "door" ? doorOtherRoom(target.id, you.room) ?? null : null;
  const brokenDoors = useMemo(() => new Set(view.doors.filter((d) => d.broken).map((d) => d.to)), [view.doors]);

  // The Superkube's options (#170): a cheat input, so only while cheats are allowed, and never in a replay.
  const kube = cheatsAllowed && !readOnly ? (op: KubeOpId, arg?: string | number) => post(arg === undefined ? { type: "kube", op } : { type: "kube", op, arg }) : undefined;

  const terminal = terminalId ? view.roomEquipment.find((e) => e.id === terminalId) ?? null : null;

  return (
    <ServerClockContext.Provider value={clock}>
    <main className="game">
      <Announcer />
      <WakeUpAnnouncement waking={waking} text={t("wake.ready", { day: view.day, cycle: view.cycleOfDay, room: names.room(you.room) })} />
      <TerminalDialog terminal={terminal} view={view} onAction={act} onClose={() => setTerminalId(null)} onSharePlanet={(planet, text) => post({ type: "sharePlanet", planet, text })} />
      <EndScreen view={view} open={view.phase === "ended" && !endClosed} onOpenChange={(open) => setEndClosed(!open)} replayId={replayId} />
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
        onCheatRoom={Object.hasOwn(view.rooms, CHEAT_ROOM) && view.you.room !== CHEAT_ROOM ? () => post({ type: "cheatRoom" }) : undefined}
        onLeaveShip={() => post({ type: "leaveShip" })}
        onInspectSelf={() => {
          select({ kind: "player", id: you.id });
          setPanel("inspect");
        }}
      />
      {!mobile && transport && <div className="game-transport">{transport}</div>}

      <div className="three-panel" data-panel={panel}>
        <div className="left-column">
          <InspectPanel view={view} layout={layout} target={target} onAction={act} onDeselect={selected && target === selected ? () => select(null) : undefined} onKube={kube} />
        </div>

        <div className="world">
          <div className="room-view">
            {!you.alive ? (
              <DeathNotice view={view} />
            ) : view.patrolShip && view.expedition?.report === undefined ? (
              <PatrolCockpit view={view} ship={view.patrolShip} layout={layout} onAction={act} />
            ) : isLostPlace(you.room) ? (
              <LostPanel view={view} onShareReport={readOnly ? undefined : (report, text) => post({ type: "shareReport", report, text })} />
            ) : inIcarus ? (
              <IcarusPanel
                view={view}
                expedition={view.expedition?.report !== undefined ? view.expedition : null}
                selected={target}
                onSelect={select}
                onAction={act}
                onShareReport={readOnly ? undefined : (report, text) => post({ type: "shareReport", report, text })}
              />
            ) : layout ? (
              <LeavingIsoRoom
                layout={layout}
                room={you.room}
                onFire={view.roomOnFire}
                titleId={roomTitleId}
                occupants={[you, ...view.players.filter((p) => p.room === you.room)]
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map(occupant)}
                nearby={nearby}
                corpses={corpses}
                drones={drones}
                fogDepth={fogDepth}
                renderer={ROOM_RENDERER}
                zoom={zoom}
                onZoomStep={(dir) => setZoom((z) => stepZoom(z, dir) ?? z)}
                equipment={view.roomEquipment}
                reachable={reachable}
                brokenDoors={brokenDoors}
                selected={target}
                selectedDoor={selectedDoor}
                actingOn={actingOn}
                sentCount={sentCount}
                atTerminal={terminalId !== null}
                teleport={you.cheats.includes("instantActions")}
                snap={snapWalks}
                doorMoves={doorMoves}
                onMove={move}
                onWalk={readOnly ? undefined : (cell, sitting, behind) => view.config.sharedSpots && post({ type: "walk", x: cell.x, y: cell.y, sitting, ...(behind && { behind }) })}
                onSelect={select}
                onClear={() => select(null)}
                onDoorTap={tapDoor}
                onOpenInventory={() => setInventoryOpen(true)}
                inventoryOpen={inventoryOpen}
                bubbles={bubbles}
                pilgredRepaired={view.pilgredRepaired}
                humanTankFull={view.humanTankFull}
                projects={view.projects}
                research={view.research}
                pace={shipPace(view.navigation)}
                planet={orbitImage(view.navigation.orbitPicture)}
                turn={view.navigation.lastTurn}
              />
            ) : (
              <section className="iso-room loading">{t("common.loadingShip")}</section>
            )}
            {you.alive && <RoomList view={view} layout={layout} reachable={reachable} onSelect={(target) => { select(target); setFocusActions((n) => n + 1); }} onMove={move} quiet={readOnly} />}
            {mobile && <ShipOverlay view={view} />}
            {!mobile && you.alive && <SelfHud view={view} onInspect={() => select({ kind: "player", id: you.id })} />}
            {/* Bottom-left: the action queue. */}
            {you.alive && (
              <div className="room-bottom-left">
                <ActionQueue view={view} onClear={readOnly ? undefined : () => post({ type: "clearQueue" })} />
              </div>
            )}
            {you.alive && !readOnly && <TipCard view={view} />}
            {you.alive && (
              <InventoryOverlay
                view={view}
                selected={target}
                onAction={act}
                onSelect={select}
                zoom={zoom}
                onZoom={setZoom}
                open={inventoryOpen}
                onOpenChange={setInventoryOpen}
              />
            )}
            {/* Top-right: one card (amber, red when your room is on fire) holding your room's name with the minimap under it. */}
            <div className={`room-corner${inRoom && view.roomOnFire ? " alert" : ""}`}>
              {inRoom && (
                <div className="room-title">
                  <div className="room-icons" role="status">
                    {view.roomOnFire && (
                      <Hint label={t("roomList.onFire")}>
                        <img src={FIRE_ICON} alt={t("roomList.onFire")} />
                      </Hint>
                    )}
                    {view.roomCeasefire !== null && (
                      <Hint label={t("roomList.ceasefire", { count: view.roomCeasefire })}>
                        <img src={skillIcon("diplomacy")} alt={t("roomList.ceasefire", { count: view.roomCeasefire })} />
                      </Hint>
                    )}
                  </div>
                  <h2 id={roomTitleId}>{names.room(you.room)}</h2>
                </div>
              )}
              <Minimap
                here={you.room}
                youId={you.id}
                people={[you, ...view.players]}
                unidentified={view.unidentified}
                reachable={reachable}
                burningRooms={view.burningRooms}
                brokenDoors={view.brokenDoors}
              />
            </div>
          </div>
        </div>

        <ITrackie
          view={view}
          roomLogRequest={roomLogRequest}
          quiet={readOnly}
          onChat={(channel, text) => post({ type: "chat", channel, text })}
          onCreateThread={(name, from) => post(from === undefined ? { type: "createThread", name } : { type: "createThread", name, from })}
          onToggle={(channel, seq, line) => post({ type: "toggleCheckbox", channel, seq, line })}
          onShareReport={readOnly ? undefined : (report, text) => post({ type: "shareReport", report, text })}
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
          reachable={reachable}
          onAction={act}
          onMove={move}
          onMore={() => setPanel("inspect")}
          onKube={kube}
        />
      )}
      {mobile && transport && <div className="game-transport">{transport}</div>}
      {mobile && <BottomNav panel={panel} onChange={setPanel} view={view} />}
    </main>
    </ServerClockContext.Provider>
  );
}
