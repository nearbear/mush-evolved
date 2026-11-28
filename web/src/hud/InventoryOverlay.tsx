// A sack button in the room view's lower-right corner that opens your inventory and the room's items
// over the isometric scene (the same InventoryPanel the old self panel used to hold). It stays open while you
// take and drop, and closes on the button, Escape, or a press elsewhere in the room view. UI-only state.
// Open, the panel spans the room view's width in the band between your ID card and the minimap (owner,
// 2026-11-21), on both layouts; useBand measures that band.

import { type CSSProperties, type Ref, type RefObject, useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Action, PlayerView, Target } from "@mush2/shared";
import { TAB_ICONS } from "../art/assets.ts";
import { Hint } from "./IconButton.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { useOverlayDismiss } from "./useOverlayDismiss.ts";

/** The magnifications the room view steps through. */
export const ZOOM_STEPS = [1 / 2, 1, 2];

/** The magnification one step in (1) or out (-1) from `zoom`, or undefined at the end. */
export const stepZoom = (zoom: number, dir: 1 | -1): number | undefined => ZOOM_STEPS[ZOOM_STEPS.indexOf(zoom) + dir];

/** Wide desktop monitors (e.g. 2K/4K), or the phone layout held upright (where 1x art is tiny on a dense screen). */
export const BIG_ROOM_QUERY = "(min-width: 2000px) and (min-height: 900px), (max-width: 1023px) and (orientation: portrait)";

/** Starts the room at 2x on wide desktop monitors and on phones and tablets held upright, 1x elsewhere. */
export const defaultRoomZoom = (): number =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(BIG_ROOM_QUERY).matches ? 2 : 1;

/** Your ID card: the desktop's (SelfHud) or the phone's (PlayerSummary in .room-top-left). */
const ID_CARD = ".self-hud-top, .room-top-left > .nameplate";
/** What the panel stays above: the location plate with the minimap, the zoom buttons and sack, and the notes button. */
const BELOW = ".room-corner, .inventory-controls, .notes-controls";
/** The panel's distance from the room view's edges and from the cards it sits between, in px (0.5rem). */
const MARGIN = 8;

/**
 * While open, the panel's top and bottom offsets inside the room view: under your ID card and over the minimap's card
 * and the sack, or the room view's own edges where one isn't shown (the Icarus, a lost place). Measured on layout and
 * whenever the room view, the cards or the phone's peek bar resize (the minimap grows when expanded).
 */
export function useBand(open: boolean, rootRef: RefObject<HTMLElement | null>): CSSProperties | undefined {
  const [band, setBand] = useState<{ top: number; bottom: number }>();
  const measure = useCallback(() => {
    const room = rootRef.current?.closest(".room-view");
    if (!room || room.getClientRects().length === 0) return; // a hidden phone tab: measure when it shows
    const box = room.getBoundingClientRect();
    // Only what is drawn: the patrol cockpit hides the minimap's card with CSS.
    const shown = (selector: string) => [...room.querySelectorAll(selector)].filter((el) => el.getClientRects().length > 0).map((el) => el.getBoundingClientRect());
    const card = shown(ID_CARD)[0];
    const top = (card ? card.bottom - box.top : 0) + MARGIN;
    const above = Math.min(box.bottom, ...shown(BELOW).map((r) => r.top)) - MARGIN;
    const bottom = box.bottom - above;
    setBand((old) => (old?.top === top && old.bottom === bottom ? old : { top, bottom }));
  }, [rootRef]);
  // After every render too: the cards move without resizing (the peek bar appearing lifts the minimap's card).
  useLayoutEffect(() => {
    if (open) measure();
  });
  useLayoutEffect(() => {
    const room = rootRef.current?.closest(".room-view");
    if (!open || !room) return;
    const ro = new ResizeObserver(measure);
    ro.observe(room);
    for (const el of room.querySelectorAll(`${ID_CARD}, ${BELOW}, .peek-bar`)) ro.observe(el);
    return () => ro.disconnect();
  }, [open, measure, rootRef]);
  return open && band ? { top: band.top, bottom: band.bottom } : undefined;
}

export function InventoryOverlay({
  view,
  selected,
  onAction,
  onSelect,
  zoom,
  onZoom,
  open: controlledOpen,
  onOpenChange,
}: {
  view: PlayerView;
  selected: Target;
  onAction: (action: Action) => void;
  onSelect: (target: Target) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    if (controlledOpen === undefined) setLocalOpen(false);
    onOpenChange?.(false);
  }, [controlledOpen, onOpenChange]);
  useOverlayDismiss(open, close, rootRef);
  const band = useBand(open, rootRef);

  const toggle = () => {
    const next = !open;
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className="inventory-overlay" ref={rootRef}>
      {open && (
        <section id={panelId} role="dialog" tabIndex={-1} className="panel inventory-popup" style={band} aria-label={t("inventory.button")}>
          <InventoryPanel view={view} selected={selected} onAction={onAction} onSelect={onSelect} />
        </section>
      )}
      <div className="inventory-controls">
        <div className="zoom-controls">
          {(["in", "out"] as const).map((way) => {
            const next = stepZoom(zoom, way === "in" ? 1 : -1);
            return (
              <Hint key={way} label={`${t(`zoom.${way}`)} (${way === "in" ? "+" : "−"})`}>
                {/* Hidden from screen readers and out of the Tab order: the + and - keys on the room view do the same. */}
                <button type="button" className="zoom-button" aria-hidden="true" tabIndex={-1} aria-label={t(`zoom.${way}`)} disabled={next === undefined} onClick={() => next && onZoom(next)}>
                  {way === "in" ? "+" : "−"}
                </button>
              </Hint>
            );
          })}
        </div>
        <InventoryToggle view={view} open={open} glow={!open && selected.kind === "item"} controls={open ? panelId : undefined} onClick={toggle} />
      </div>
    </div>
  );
}

/**
 * The sack: opens your inventory and the room's items, with a badge counting the room's items. Shared by the room view's
 * corner and an open terminal (TerminalDialog), which keeps it usable over its backdrop.
 */
export function InventoryToggle({
  view,
  open,
  glow,
  controls,
  onClick,
  ref,
}: {
  view: Pick<PlayerView, "roomItems">;
  open: boolean;
  /** An item has no sprite in the room to glow, so while one is selected and the sack is shut, the sack glows. */
  glow: boolean;
  /** The open panel's id. */
  controls?: string;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const roomCount = view.roomItems.length;
  const label = roomCount > 0 ? t("inventory.buttonCount", { count: roomCount }) : t("inventory.button");
  return (
    <Hint label={label}>
      <button ref={ref} type="button" className="inventory-toggle" data-selection={glow ? "" : undefined} aria-label={label} aria-expanded={open} aria-controls={controls} onClick={onClick}>
        <img src={TAB_ICONS.inventory} alt="" />
        {roomCount > 0 && (
          <span className="inventory-badge" aria-hidden="true">
            {roomCount}
          </span>
        )}
      </button>
    </Hint>
  );
}
