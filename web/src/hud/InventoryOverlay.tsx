// A sack button in the room view's lower-right corner that opens your inventory and the room's items
// over the isometric scene (the same InventoryPanel the old self panel used to hold). It stays open while you
// take and drop, and closes on the button, Escape, or a press elsewhere in the room view. UI-only state.

import { useCallback, useId, useRef, useState } from "react";
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

  const toggle = () => {
    const next = !open;
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  };

  const roomCount = view.roomItems.length;
  const label = roomCount > 0 ? t("inventory.buttonCount", { count: roomCount }) : t("inventory.button");

  return (
    <div className="inventory-overlay" ref={rootRef}>
      {open && (
        <section id={panelId} role="dialog" tabIndex={-1} className="panel inventory-popup" aria-label={t("inventory.button")}>
          <InventoryPanel view={view} selected={selected} onAction={onAction} onSelect={onSelect} />
        </section>
      )}
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
      <Hint label={label}>
        <button
          type="button"
          className="inventory-toggle"
          // An item has no sprite in the room to glow, so while one is selected and the sack is shut, the sack glows.
          data-selection={!open && selected.kind === "item" ? "" : undefined}
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={toggle}
        >
          <img src={TAB_ICONS.inventory} alt="" />
          {roomCount > 0 && (
            <span className="inventory-badge" aria-hidden="true">
              {roomCount}
            </span>
          )}
        </button>
      </Hint>
    </div>
  );
}
