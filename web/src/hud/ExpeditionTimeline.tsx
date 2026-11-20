// The expedition screen while away (docs/plans/expedition-ui.md, "The expedition screen"; owner, 2026-11-19): a
// timeline of columns, oldest left (expeditionTimeline.ts), with the current one full size in the middle and its
// neighbours clipped at each side. The arrow buttons, a sideways swipe, and the Left and Right keys while focus is in
// it move one column. A step that resolves while you are on the latest one moves you to it (owner, 2026-11-19); while
// you look back, the view stays and the right arrow says "new". Each new step is announced politely. The crew and
// their HP are on the Icarus's podiums under it (IcarusPanel.tsx), not here.
// Renders the view only: the rules wrote every event, and which steps are left comes from the view.

import type { ExpeditionEvent, ExpeditionReportView, PlanetTag, PlayerView } from "@mush2/shared";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { announce } from "../announce.ts";
import { itemIcon, planetTagIcon } from "../art/assets.ts";
import { useKeyedSprite } from "../art/keyedSprite.ts";
import { useNames } from "../i18n/names.ts";
import { useEventLines } from "./ExpeditionReportDialog.tsx";
import { latestColumn, timelineColumns, type StepBadge, type TimelineColumn } from "./expeditionTimeline.ts";
import { useCountdown } from "./useCountdown.ts";
import { VisibilityBadge } from "./VisibilityBadge.tsx";

interface Props {
  /** The expedition under way; null for a lost member, whose timeline is the report they got lost on. */
  expedition: NonNullable<PlayerView["expedition"]> | null;
  /** Your report of it (`view.expeditions`), if you have one. */
  report: ExpeditionReportView | undefined;
}

/** How far a pointer must travel sideways, more than up or down, to count as a swipe (CSS px). */
const SWIPE_PX = 40;

export function ExpeditionTimeline({ expedition, report }: Props) {
  const { t } = useTranslation();
  const events = report?.events ?? [];
  const columns = timelineColumns({ events, lost: expedition === null, returnAt: expedition?.returnAt ?? 0, next: expedition?.next, nextAt: expedition?.nextAt, steps: expedition?.steps });
  const sectorName = useSectorName();
  const { pos, seen, moveTo } = usePosition(columns, events);
  // A step resolved since you looked: say which, without moving focus.
  const announced = useRef(events.length);
  useEffect(() => {
    if (events.length > announced.current) {
      const latest = events.at(-1);
      if (latest) announce(t("expedition.timeline.newStep", { sector: sectorName(latest.sector) }));
    }
    announced.current = events.length;
  }, [events, sectorName, t]);

  const current = columns[pos];
  const hasNew = columns.some((c, i) => c.kind === "step" && i > seen);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    moveTo(pos + (e.key === "ArrowLeft" ? -1 : 1));
  };
  // Plain pointer events, no gesture library: a sideways swipe moves one column (left swipe: later).
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    swipeFrom.current = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const sideways = Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - from.y);
    // A swipe to the left brings the later column in.
    if (sideways) moveTo(dx < 0 ? pos + 1 : pos - 1);
  };
  return (
    <section className="expedition-timeline" aria-label={t("expedition.timeline.label")} onKeyDown={onKeyDown}>
      <div className="timeline-track" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipeFrom.current = null)}>
        <button type="button" className="timeline-arrow timeline-prev" aria-label={t("expedition.timeline.previous")} disabled={pos === 0} onClick={() => moveTo(pos - 1)}>
          <span aria-hidden="true">◀</span>
        </button>
        <div className="timeline-side timeline-side-prev" aria-hidden="true">
          {columns[pos - 1] && <Column column={columns[pos - 1]!} compact />}
        </div>
        <div className="timeline-current" role="group" aria-label={t("expedition.timeline.position", { n: pos + 1, total: columns.length })}>
          {current && <Column column={current} />}
        </div>
        <div className="timeline-side timeline-side-next" aria-hidden="true">
          {columns[pos + 1] && <Column column={columns[pos + 1]!} compact />}
        </div>
        <button
          type="button"
          className="timeline-arrow timeline-next"
          aria-label={hasNew ? t("expedition.timeline.nextNew") : t("expedition.timeline.next")}
          disabled={pos >= columns.length - 1}
          onClick={() => moveTo(pos + 1)}
        >
          <span aria-hidden="true">▶</span>
          {hasNew && (
            <span className="timeline-new" aria-hidden="true">
              {t("expedition.timeline.new")}
            </span>
          )}
        </button>
      </div>
    </section>
  );
}

/**
 * Which column you look at and the furthest step you have seen. Opens on the latest step; a new step moves you only
 * if you were on the latest one.
 */
function usePosition(columns: readonly TimelineColumn[], events: readonly ExpeditionEvent[]) {
  const latest = latestColumn(columns);
  const [pos, setPos] = useState(latest);
  const [seen, setSeen] = useState(latest);
  const [count, setCount] = useState(events.length);
  if (events.length !== count) {
    // Adjusting state during render on a changed input (React's documented pattern), so nothing draws in between.
    const following = pos >= count - 1;
    setCount(events.length);
    if (following) {
      setPos(latest);
      setSeen(latest);
    }
  }
  const clamped = Math.min(Math.max(0, pos), columns.length - 1);
  const moveTo = (to: number) => {
    const next = Math.min(Math.max(0, to), columns.length - 1);
    setPos(next);
    setSeen((s) => Math.max(s, next));
  };
  return { pos: clamped, seen, moveTo };
}

/** A sector's name; the landing and the U-turn aren't sectors but are named like them. */
function useSectorName(): (sector: string | null) => string {
  const { t } = useTranslation();
  return (sector) =>
    sector === null
      ? t("astro.unknown")
      : sector === "LANDING"
        ? t("expedition.landing")
        : sector === "U_TURN"
          ? t("expedition.uTurnHeading")
          : t(`astro.tags.${sector}` as never, { defaultValue: sector });
}

/** A sector's icon at whole-pixel scale. The unknown sector's art has no alpha, so its background is keyed out. */
function TagIcon({ sector }: { sector: string | null }) {
  // The U-turn leads back to the landing site.
  const src = planetTagIcon(sector === "U_TURN" ? "LANDING" : sector);
  const unknown = src === planetTagIcon(null);
  return unknown ? <KeyedIcon src={src} /> : <img className="timeline-icon" src={src} alt="" draggable={false} />;
}

function KeyedIcon({ src }: { src: string }) {
  const url = useKeyedSprite(src);
  return url ? <img className="timeline-icon timeline-icon-unknown" src={url} alt="" draggable={false} /> : <span className="timeline-icon timeline-icon-unknown" />;
}

function Column({ column, compact = false }: { column: TimelineColumn; compact?: boolean }) {
  switch (column.kind) {
    case "step":
      return <StepColumn event={column.event} badge={column.badge} compact={compact} />;
    case "next":
      return <NextColumn tag={column.tag} at={column.at} />;
    case "later":
      return <LaterColumn />;
    case "return":
      return <ReturnColumn at={column.at} />;
  }
}

function StepColumn({ event, badge, compact }: { event: ExpeditionEvent; badge: StepBadge | null; compact: boolean }) {
  const { t } = useTranslation();
  const names = useNames();
  const sectorName = useSectorName();
  const { lines } = useEventLines()(event);
  const items = [...(event.item && event.kind !== "lostItem" && (event.amount ?? 0) > 0 ? [{ item: event.item, count: event.amount ?? 0 }] : []), ...(event.found ?? [])];
  const [headline, ...rest] = lines;
  return (
    <div className="timeline-column" data-compact={compact || undefined}>
      <TagIcon sector={event.sector} />
      <h3>{sectorName(event.sector)}</h3>
      {badge && <span className={`timeline-badge timeline-badge-${badge}`}>{t(`expedition.timeline.badge.${badge}`)}</span>}
      {headline && <p className="timeline-headline">{headline}</p>}
      {!compact && (
        <>
          {items.length > 0 && (
            <ul className="timeline-items">
              {items.map((f) => (
                <li key={f.item}>
                  <img src={itemIcon(f.item)} alt="" draggable={false} />
                  <span>{t("expedition.timeline.itemCount", { item: names.item(f.item), count: f.count })}</span>
                </li>
              ))}
            </ul>
          )}
          {rest.length > 0 && (
            <ul className="timeline-lines">
              {rest.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** The next step: a mystery with its countdown, or its sector with a badge for the U-turn or Traitor holder. */
function NextColumn({ tag, at }: { tag: PlanetTag | null; at: number | null }) {
  const { t } = useTranslation();
  const sectorName = useSectorName();
  return (
    <div className="timeline-column timeline-future">
      <TagIcon sector={tag} />
      <h3>
        {sectorName(tag)}
        {tag !== null && <VisibilityBadge kind="private" leaked={false} text={t("expedition.timeline.nextPrivate")} />}
      </h3>
      <p className="timeline-headline">{t("expedition.timeline.nextStep")}</p>
      {at !== null && <NextCountdown at={at} />}
    </div>
  );
}

function NextCountdown({ at }: { at: number }) {
  const { t } = useTranslation();
  return <p className="timeline-when">{t("expedition.timeline.in", { time: useCountdown(at) })}</p>;
}

function LaterColumn() {
  const { t } = useTranslation();
  return (
    <div className="timeline-column timeline-future">
      <TagIcon sector={null} />
      <h3>{t("astro.unknown")}</h3>
      <p className="timeline-headline">{t("expedition.timeline.later")}</p>
    </div>
  );
}

function ReturnColumn({ at }: { at: number }) {
  const { t } = useTranslation();
  return (
    <div className="timeline-column timeline-future timeline-return">
      <span className="timeline-icon" />
      <h3>{t("expedition.timeline.return")}</h3>
      <p className="timeline-when">{t("expedition.back", { time: useCountdown(at) })}</p>
    </div>
  );
}
