// The replay's playback controls (#370, docs/plans/replay-viewer.md, story 4), in GameView's `transport` slot. A
// desktop bar with every control, or a phone strip (step back, play, step forward, the cycle, the switcher) with the
// rest in a "⋯" menu. Where each button goes is worked out by the page (transport.ts); this only draws and reports.

import { Menu } from "@base-ui/react/menu";
import { Select } from "@base-ui/react/select";
import { Slider } from "@base-ui/react/slider";
import { characterName, type PlayerId, type ReplayIndex, type SeatAt } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { verdictKey } from "../hud/EndScreen.tsx";
import { chunkOf } from "./replayState.ts";
import { OlderBuildBadge } from "./ReplayNotice.tsx";
import { cycleStart, dayAt, type Speed, SPEEDS, type TransportKey } from "./transport.ts";
import type { Replay } from "./useReplay.ts";

export interface TransportProps {
  replay: Pick<Replay, "position" | "stale" | "seats" | "followed" | "olderBuild" | "summary" | "seek">;
  index: ReplayIndex;
  /** The game's cycles per day (from any frame: fixed for a game). */
  cyclesPerDay: number;
  mobile: boolean;
  /** Where each control goes now; null disables it. */
  targets: Record<Exclude<TransportKey, "playPause">, number | null>;
  allSeeing: boolean;
  onPerspective: (seat: PlayerId, allSeeing: boolean) => void;
  playing: boolean;
  onPlayPause: () => void;
  speed: Speed;
  onSpeed: (speed: Speed) => void;
  skip: boolean;
  onSkip: (skip: boolean) => void;
}

export function Transport(props: TransportProps) {
  const { t } = useTranslation();
  const { replay, index, cyclesPerDay, mobile, targets, playing, onPlayPause } = props;
  const day = dayAt(index, replay.position, { cyclesPerDay });
  const label = day ? t("replay.dayCycle", { day: day.day, cycle: day.cycleOfDay }) : "";
  const go = (key: Exclude<TransportKey, "playPause">) => () => {
    const to = targets[key];
    if (to !== null) replay.seek(to);
  };
  const stepButton = (key: Exclude<TransportKey, "playPause">, glyph: string) => (
    <button type="button" className="replay-icon-button" aria-label={t(`replay.${key}`)} disabled={targets[key] === null} onClick={go(key)}>
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
  const play = (
    <button type="button" className="replay-icon-button replay-play" aria-label={playing ? t("replay.pause") : t("replay.play")} aria-pressed={playing} onClick={onPlayPause}>
      <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
    </button>
  );
  return (
    <div className="replay-transport" role="group" aria-label={t("replay.transport")} data-stale={replay.stale || undefined} data-mobile={mobile || undefined}>
      {/* Read out only when the cycle changes: the text is the same for every step within one. */}
      <span className="sr-only" role="status">
        {label}
      </span>
      {mobile ? (
        <>
          {stepButton("stepBack", "◀")}
          {play}
          {stepButton("stepForward", "▶")}
          <span className="replay-cycle-label" aria-hidden="true">
            {label}
          </span>
          <Perspective {...props} />
          <MoreMenu {...props} />
        </>
      ) : (
        <>
          <div className="replay-row">
            <CycleSelect index={index} position={replay.position} cyclesPerDay={cyclesPerDay} seek={replay.seek} />
            <CycleScrubber index={index} position={replay.position} cyclesPerDay={cyclesPerDay} seek={replay.seek} />
          </div>
          <div className="replay-row">
            {stepButton("eventBack", "⇤")}
            {stepButton("stepBack", "◀")}
            {play}
            {stepButton("stepForward", "▶")}
            {stepButton("eventForward", "⇥")}
            <SpeedSelect speed={props.speed} onSpeed={props.onSpeed} />
            <label className="replay-skip">
              <input type="checkbox" checked={props.skip} onChange={(e) => props.onSkip(e.target.checked)} />
              {t("replay.skip")}
            </label>
            <Perspective {...props} />
            {replay.olderBuild && <OlderBuildBadge />}
            <Summary summary={replay.summary} />
          </div>
        </>
      )}
    </div>
  );
}

/** "Day 2 · cycle 3" for a chunk. */
function useChunkLabel(index: ReplayIndex, cyclesPerDay: number) {
  const { t } = useTranslation();
  return (n: number) => {
    const day = dayAt(index, cycleStart(index, n), { cyclesPerDay });
    return day ? t("replay.dayCycle", { day: day.day, cycle: day.cycleOfDay }) : "";
  };
}

interface CycleProps {
  index: ReplayIndex;
  position: number;
  cyclesPerDay: number;
  seek: (seq: number) => void;
}

function CycleSelect({ index, position, cyclesPerDay, seek }: CycleProps) {
  const { t } = useTranslation();
  const chunkLabel = useChunkLabel(index, cyclesPerDay);
  const n = chunkOf(index, position);
  return (
    <Select.Root value={n} onValueChange={(v) => v !== null && seek(cycleStart(index, v))}>
      <Select.Trigger className="replay-select" aria-label={t("replay.cycleSelect")}>
        <Select.Value>{() => chunkLabel(n)}</Select.Value>
        <Select.Icon aria-hidden="true">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} alignItemWithTrigger={false} className="feature-select-positioner">
          <Select.Popup className="feature-select-popup replay-select-popup">
            <Select.List>
              {index.chunks.map((_, c) => (
                <Select.Item key={c} value={c} className="feature-select-item">
                  <Select.ItemText>{chunkLabel(c)}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/** The cycle scrubber: one notch per chunk. Dragging seeks to each cycle's start; the page dims the stage meanwhile. */
function CycleScrubber({ index, position, cyclesPerDay, seek }: CycleProps) {
  const { t } = useTranslation();
  const chunkLabel = useChunkLabel(index, cyclesPerDay);
  const n = chunkOf(index, position);
  const max = index.chunks.length - 1;
  if (max < 1) return null;
  return (
    <Slider.Root className="replay-scrubber" value={n} min={0} max={max} step={1} onValueChange={(v) => seek(cycleStart(index, v))}>
      <Slider.Control className="replay-scrubber-control">
        <Slider.Track className="replay-scrubber-track">
          <Slider.Indicator className="replay-scrubber-fill" />
          <Slider.Thumb className="replay-scrubber-thumb" aria-label={t("replay.cycleScrubber")} getAriaValueText={(_, value) => chunkLabel(value)} />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

function SpeedSelect({ speed, onSpeed }: { speed: Speed; onSpeed: (speed: Speed) => void }) {
  const { t } = useTranslation();
  return (
    <Select.Root value={speed} onValueChange={(v) => v !== null && onSpeed(v)}>
      <Select.Trigger className="replay-select" aria-label={t("replay.speed")}>
        <Select.Value>{() => t("replay.speedValue", { speed })}</Select.Value>
        <Select.Icon aria-hidden="true">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} alignItemWithTrigger={false} className="feature-select-positioner">
          <Select.Popup className="feature-select-popup">
            <Select.List>
              {SPEEDS.map((s) => (
                <Select.Item key={s} value={s} className="feature-select-item">
                  <Select.ItemText>{t("replay.speedValue", { speed: s })}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/** A seat's name in the switcher: its character now, and where it started if a Transfer moved it. */
function useSeatName() {
  const { t } = useTranslation();
  return (s: SeatAt) => (s.moved ? t("replay.seatMoved", { character: characterName(s.character), start: characterName(s.start) }) : characterName(s.character));
}

/** The perspective switcher ("All-seeing" or a seat's own view) with the badge naming the mode. */
function Perspective({ replay, allSeeing, onPerspective, mobile }: TransportProps) {
  const { t } = useTranslation();
  const seatName = useSeatName();
  const { seats, followed } = replay;
  const current = seats.find((s) => s.seat === followed);
  if (!current) return null;
  const who = characterName(current.character);
  const badge = allSeeing ? t("replay.followingAll", { character: who }) : t("replay.seenBy", { character: who });
  return (
    <div className="replay-perspective">
      <button type="button" className="replay-all-seeing" aria-pressed={allSeeing} onClick={() => onPerspective(current.seat, !allSeeing)}>
        {mobile ? <span aria-hidden="true">👁</span> : t("replay.allSeeing")}
        {mobile && <span className="sr-only">{t("replay.allSeeing")}</span>}
      </button>
      <Select.Root value={current.seat} onValueChange={(v) => v !== null && onPerspective(v, allSeeing)}>
        <Select.Trigger className="replay-select replay-seat" aria-label={t("replay.perspective")}>
          <Select.Value>{() => (mobile ? who : badge)}</Select.Value>
          <Select.Icon aria-hidden="true">▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} alignItemWithTrigger={false} className="feature-select-positioner">
            <Select.Popup className="feature-select-popup replay-select-popup">
              <Select.List>
                {seats.map((s) => (
                  <Select.Item key={s.seat} value={s.seat} className="feature-select-item">
                    <Select.ItemText>{seatName(s)}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

/** When the game ended and how: from the games list's entry, when it came. */
function Summary({ summary }: { summary: Replay["summary"] }) {
  const { t, i18n } = useTranslation();
  if (!summary) return null;
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium" }).format(summary.endedAt);
  return (
    <p className="replay-summary">
      <time dateTime={new Date(summary.endedAt).toISOString()}>{date}</time> · {t(verdictKey(summary.ending, summary.winner))}
    </p>
  );
}

/** The phone strip's overflow: events, cycles, speed, skip, and the summary. */
function MoreMenu({ replay, targets, speed, onSpeed, skip, onSkip }: TransportProps) {
  const { t } = useTranslation();
  const item = (key: "eventBack" | "eventForward" | "cycleBack" | "cycleForward") => (
    <Menu.Item render={<button type="button" />} disabled={targets[key] === null} onClick={() => targets[key] !== null && replay.seek(targets[key])}>
      {t(`replay.${key}`)}
    </Menu.Item>
  );
  return (
    <Menu.Root>
      <Menu.Trigger className="replay-icon-button" aria-label={t("replay.more")}>
        <span aria-hidden="true">⋯</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" side="top" className="menu-positioner">
          <Menu.Popup className="menu-popup replay-menu">
            {item("eventBack")}
            {item("eventForward")}
            {item("cycleBack")}
            {item("cycleForward")}
            <Menu.CheckboxItem render={<button type="button" />} checked={skip} onCheckedChange={onSkip} closeOnClick={false}>
              <Menu.CheckboxItemIndicator keepMounted className="replay-check">
                {skip ? "☑" : "☐"}
              </Menu.CheckboxItemIndicator>
              {t("replay.skip")}
            </Menu.CheckboxItem>
            <Menu.Group>
              <Menu.GroupLabel className="replay-menu-label">{t("replay.speed")}</Menu.GroupLabel>
              <Menu.RadioGroup value={speed} onValueChange={(v) => onSpeed(v as Speed)} className="replay-speeds">
                {SPEEDS.map((s) => (
                  <Menu.RadioItem key={s} value={s} render={<button type="button" />} closeOnClick={false}>
                    {t("replay.speedValue", { speed: s })}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            {replay.olderBuild && <OlderBuildBadge />}
            <Summary summary={replay.summary} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
