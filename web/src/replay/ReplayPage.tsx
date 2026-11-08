// The replay page, /replay/:id (#370, docs/plans/replay-viewer.md, story 4): a finished game in GameView, read-only,
// with the transport. `useReplay` loads it; transport.ts decides where each control goes; this holds the playback
// state (playing, speed, skip, the seat followed), the timer and the keyboard, and keeps the URL on the moment shown.
//
// - The clock is frozen at the step's time, so countdowns and action bars stand still and jump with each step.
// - The cycle countdown shows only for a game whose cycles ran on a clock (`index.realTime`), counting to when the
//   next cycle actually began.
// - Walks play on a single step forward; any other move (back, a jump, a seat switch) snaps everyone into place.
// - Doesn't pass the step's `reveal` to anything yet (story 5).

import type { PlayerId } from "@mush2/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { GameView } from "../GameView.tsx";
import { useMobile } from "../useMobile.ts";
import { ReplayNotice } from "./ReplayNotice.tsx";
import { lastSeq, type Step } from "./replayState.ts";
import { Transport, type TransportProps } from "./Transport.tsx";
import {
  marksOf,
  nextCycle,
  nextStop,
  ownsKey,
  parseReplayParams,
  playInterval,
  prevCycle,
  prevStop,
  replayParams,
  type Speed,
  transportKey,
} from "./transport.ts";
import { useReplay } from "./useReplay.ts";
import "./replay.css";

/** Whether moving from `from` to `to` should snap walkers instead of animating: anything but one step forward. */
function snaps(from: { seq: number; seat: PlayerId | null } | null, to: Step | null, seat: PlayerId | null): boolean {
  return !(from && to && to.seq === from.seq + 1 && seat === from.seat);
}

export default function ReplayPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const mobile = useMobile();
  const [search, setSearch] = useSearchParams();
  // The URL is read once: after that the page writes it.
  const [initial] = useState(() => parseReplayParams(search));
  const [seat, setSeat] = useState<PlayerId | null>(initial.seat);
  const [allSeeing, setAllSeeing] = useState(initial.allSeeing);
  const replay = useReplay(id, { ...(initial.input !== undefined && { start: initial.input }), seat, allSeeing });
  const { index, position, step, stale, followed, seek, status } = replay;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [skip, setSkip] = useState(true);

  // The moment on screen, in the URL; `replace`, so Back leaves the page instead of undoing steps.
  useEffect(() => {
    if (status !== "ready" || followed === null) return;
    setSearch(replayParams({ input: position, seat: followed, allSeeing }), { replace: true });
  }, [status, position, followed, allSeeing, setSearch]);

  // Walks: decided once per frame shown (the derived-state pattern), so other renders don't snap a walk under way.
  const [walk, setWalk] = useState<{ step: Step | null; seat: PlayerId | null; snap: boolean }>({ step: null, seat: null, snap: true });
  if (walk.step !== step || walk.seat !== followed) {
    setWalk({ step, seat: followed, snap: snaps(walk.step && { seq: walk.step.seq, seat: walk.seat }, step, followed) });
  }

  const marks = useMemo(() => (index ? marksOf(replay.chunks, index) : {}), [index, replay.chunks]);
  const targets = useMemo((): TransportProps["targets"] => {
    if (!index) return { stepBack: null, stepForward: null, eventBack: null, eventForward: null, cycleBack: null, cycleForward: null };
    const mode = skip ? "skip" : "raw";
    return {
      stepBack: prevStop(index, marks, position, mode),
      stepForward: nextStop(index, marks, position, mode),
      eventBack: prevStop(index, marks, position, "event"),
      eventForward: nextStop(index, marks, position, "event"),
      cycleBack: prevCycle(index, position),
      cycleForward: nextCycle(index, position),
    };
  }, [index, marks, position, skip]);

  const playPause = useCallback(() => {
    if (!index) return;
    if (!playing && position >= lastSeq(index)) seek(-1);
    setPlaying(!playing);
  }, [index, playing, position, seek]);

  // Playback: one stop per interval. It waits while the frame is stale (its chunk loading) and stops at the end.
  useEffect(() => {
    if (!playing || stale || !index) return;
    const timer = setTimeout(() => {
      if (position >= lastSeq(index)) return setPlaying(false);
      const next = targets.stepForward;
      if (next !== null) seek(next);
    }, playInterval(speed, skip));
    return () => clearTimeout(timer);
  }, [playing, stale, index, position, targets, speed, skip, seek]);

  // The keyboard, on the page, unless the focused control uses the key itself.
  const keys = useRef({ targets, playPause, seek });
  keys.current = { targets, playPause, seek };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || ownsKey(e.target instanceof Element ? e.target : null, e.key)) return;
      const key = transportKey(e);
      if (!key) return;
      e.preventDefault();
      if (key === "playPause") return keys.current.playPause();
      const to = keys.current.targets[key];
      if (to !== null) keys.current.seek(to);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onPerspective = useCallback((s: PlayerId, all: boolean) => {
    setSeat(s);
    setAllSeeing(all);
  }, []);
  const leave = useCallback(() => navigate("/games"), [navigate]);
  const frozenAt = step?.at ?? 0;
  const clock = useMemo(() => ({ frozen: frozenAt }), [frozenAt]);

  if (status !== "ready" || !index || !step || replay.cyclesPerDay === null) {
    return (
      <main className="replay-page">
        <ReplayNotice replay={replay} />
        {status !== "loading" && status !== "preparing" && status !== "ready" && (
          <p className="replay-back">
            <Link to="/games">{t("replay.back")}</Link>
          </p>
        )}
      </main>
    );
  }

  const transport = (
    <Transport
      replay={replay}
      index={index}
      cyclesPerDay={replay.cyclesPerDay}
      mobile={mobile}
      targets={targets}
      allSeeing={allSeeing}
      onPerspective={onPerspective}
      playing={playing}
      onPlayPause={playPause}
      speed={speed}
      onSpeed={setSpeed}
      skip={skip}
      onSkip={setSkip}
    />
  );

  if (!replay.view) {
    // Nobody aboard yet (an empty ship's launch state): the transport alone, to move on.
    return (
      <main className="replay-page replay-empty">
        <div className="game-transport">{transport}</div>
        <p className="replay-notice">{t("replay.nobodyAboard")}</p>
      </main>
    );
  }

  return (
    <GameView
      view={replay.view.view}
      onLeave={leave}
      clock={clock}
      nextCycleAt={index.realTime ? (index.chunks[step.chunk + 1]?.from ?? null) : null}
      transport={transport}
      snapWalks={walk.snap}
    />
  );
}
