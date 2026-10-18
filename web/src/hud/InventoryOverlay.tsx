// A sack button in the room view's lower-right corner that opens your inventory and the room's items
// over the isometric scene (the same InventoryPanel the self panel used to hold). It stays open while you
// take and drop, and closes on the button, Escape, or a press elsewhere in the room view. UI-only state.

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Action, PlayerView, Target } from "@mush2/shared";
import { TAB_ICONS } from "../art/assets.ts";
import { Hint } from "./IconButton.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";

export function InventoryOverlay({
  view,
  selected,
  onAction,
  onSelect,
}: {
  view: PlayerView;
  selected: Target;
  onAction: (action: Action) => void;
  onSelect: (target: Target) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Only presses inside the room view close it; the Inspect panel and iTrackie stay usable beside it.
    const onPress = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(".room-view") && !rootRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [open]);

  const roomCount = view.roomItems.length;
  const label = roomCount > 0 ? t("inventory.buttonCount", { count: roomCount }) : t("inventory.button");

  return (
    <div className="inventory-overlay" ref={rootRef}>
      {open && (
        <section id={panelId} className="panel inventory-popup" aria-label={t("inventory.button")}>
          <InventoryPanel view={view} selected={selected} onAction={onAction} onSelect={onSelect} />
        </section>
      )}
      <Hint label={label}>
        <button
          type="button"
          className="inventory-toggle"
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
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
