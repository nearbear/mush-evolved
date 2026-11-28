// The items stored in your room (left) and your inventory slots (right), as square icon tiles; the
// full name is a tooltip (and the peek bar on touch), and only skill books carry a label, their
// skill. Drag a tile between the two zones to take or drop it; the zones light up only when the server listed that action as legal.
// A mouse drags with native drag and drop; touch (where that is unreliable) drags with pointer events: a sideways
// swipe from a tile drags it (a vertical one still scrolls the zone). Tapping a tile selects it (outlined), and its
// Take/Drop is then on the Inspect panel and the peek bar; on touch, which has no hover, the selected tile also shows
// the tooltip a mouse gets on hover. Shift-click on a tile takes or drops it directly.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { legalIn, stackItemViews, type Action, type ItemView, type PlayerView, type Target } from "@mush2/shared";
import { Hint } from "./IconButton.tsx";
import { ConsumeEffects } from "./ConsumeEffects.tsx";
import { ItemAttrIcons } from "./ItemAttrIcons.tsx";
import { ItemFace } from "./ItemFace.tsx";
import { ItemIcon } from "./ItemIcon.tsx";
import { sameTarget } from "./targets.ts";
import { useKeepFocus } from "./useKeepFocus.ts";

type Zone = "room" | "inventory";

/** How far a finger moves before a press on a tile becomes a drag, in px. */
const DRAG_SLOP = 8;

/** No hover to show a tooltip with: the phone layout (useMobile's query) or a touch screen. Read per render, not at import. */
const noHover = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1023px), (hover: none)").matches;

/** The zone under a point, ignoring the drag ghost (it has pointer-events: none). */
const zoneAt = (x: number, y: number): Zone | null => {
  const zone = document.elementFromPoint(x, y)?.closest<HTMLElement>(".self-cards > [data-zone]")?.dataset.zone;
  return zone === "room" || zone === "inventory" ? zone : null;
};

// Keep in sync with --tile's default (4.75rem) and the grid gap in styles/items.css.
const TILE_REM = 4.75;
const GAP = 6;

/**
 * True when the items wouldn't fit the grid's space at full size (the grid then shrinks its tiles). The grid fills its
 * zone's height (inventory.css), so items take further rows of full-size tiles before shrinking.
 */
function useOverflowsSpace(count: number) {
  const hasGrid = count > 0; // the grid unmounts when empty, so re-attach the observer when it returns
  const ref = useRef<HTMLUListElement>(null);
  const [size, setSize] = useState({ width: Infinity, height: Infinity });
  useEffect(() => {
    const el = ref.current;
    if (!hasGrid || !el) return;
    const measure = () => setSize((old) => (old.width === el.clientWidth && old.height === el.clientHeight ? old : { width: el.clientWidth, height: el.clientHeight }));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [hasGrid]);
  // The tile is in rem, so it follows the UI scale (uiScale.ts): measure the root font size.
  const tile = TILE_REM * (typeof document === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  const fit = (px: number) => Math.max(1, Math.floor((px + GAP) / (tile + GAP)));
  return { ref, compact: count > fit(size.width) * fit(size.height) };
}

export function InventoryPanel({
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
  const names = useNames();
  const { t, i18n } = useTranslation();
  const [dragging, setDragging] = useState<{ id: string; from: Zone } | null>(null);
  const [over, setOver] = useState<Zone | null>(null);
  const showSelectedHint = noHover();
  // A touch drag in progress: where the finger is, and the item's icon to draw under it.
  const [ghost, setGhost] = useState<{ x: number; y: number; item: ItemView } | null>(null);
  // The press that may become a touch drag; `moved` swallows the click that can follow the drag's release.
  const press = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);

  const byName = (items: ItemView[]) => [...items].sort((a, b) => names.itemOf(a).localeCompare(names.itemOf(b), i18n.language));
  const sortedInventory = byName(view.inventory);
  // Room items that look identical to this viewer stack into one UI slot (owner, 2026-11-21);
  // inventory stays unstacked so each carried item shows its physical slot.
  const sortedRoomStacks = stackItemViews(view.roomItems).sort((a, b) =>
    names.itemOf(a.items[0]!).localeCompare(names.itemOf(b.items[0]!), i18n.language),
  );
  const empty = Math.max(0, view.inventorySlots - view.inventory.length);

  const root = useRef<HTMLDivElement>(null);
  useKeepFocus(root);
  const roomGrid = useOverflowsSpace(sortedRoomStacks.length);

  const legal = (type: "take" | "drop", item: ItemView) =>
    legalIn(view).some((a) => a.type === type && a.item === item.id);
  // Dropping on the zone the item is already in does nothing; the other zone needs a legal take/drop.
  const accepts = (zone: Zone) => {
    if (!dragging || dragging.from === zone) return false;
    const item = [...view.roomItems, ...view.inventory].find((i) => i.id === dragging.id);
    return !!item && legal(zone === "inventory" ? "take" : "drop", item);
  };
  const endDrag = () => {
    setDragging(null);
    setOver(null);
    setGhost(null);
  };
  const dropOn = (zone: Zone) => {
    if (dragging && accepts(zone)) onAction({ type: zone === "inventory" ? "take" : "drop", item: dragging.id });
    endDrag();
  };

  // Touch drag: once a finger presses a tile, its moves and release are followed on the window (the tile re-renders
  // as the drag starts, so it can't be relied on to keep pointer capture), and the zone under it is found by hit-testing.
  // The listeners outlive this render, so they read the take/drop step through a ref.
  const finishTouch = useRef<(item: ItemView, from: Zone, to: Zone | null) => void>(() => {});
  useLayoutEffect(() => {
    finishTouch.current = (item, from, to) => {
      const type = to === "inventory" ? "take" : "drop";
      if (to && to !== from && legal(type, item)) onAction({ type, item: item.id });
    };
  });
  const startTouch = (e: React.PointerEvent<HTMLButtonElement>, item: ItemView, zone: Zone) => {
    if (e.pointerType === "mouse") {
      press.current = null; // a mouse uses native drag and drop
      return;
    }
    const p = { pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    press.current = p;
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointer) return;
      if (!p.moved) {
        if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < DRAG_SLOP) return;
        p.moved = true;
        setDragging({ id: item.id, from: zone });
      }
      setGhost({ x: ev.clientX, y: ev.clientY, item });
      setOver(zoneAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointer) return;
      stop();
      if (!p.moved) return; // a tap: the click selects the tile
      finishTouch.current(item, zone, zoneAt(ev.clientX, ev.clientY));
      endDrag();
      // Long enough to swallow a click the release may fire, but no later click (a key press, say).
      setTimeout(() => {
        if (press.current === p) press.current = null;
      }, 0);
    };
    // The browser took the gesture (a vertical swipe scrolls the zone) or the press was interrupted.
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointer) return;
      stop();
      if (p.moved) endDrag();
      press.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };
  const zoneProps = (zone: Zone) => ({
    className: `item-zone${dragging && accepts(zone) ? " accepting" : ""}${over === zone && accepts(zone) ? " over" : ""}`,
    onDragOver: (e: React.DragEvent) => {
      if (!accepts(zone)) return;
      e.preventDefault();
      setOver(zone);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dropOn(zone);
    },
  });

  const tile = (item: ItemView, zone: Zone, key: string, count?: number, isDraggingOverride?: boolean) => {
    const target: Target = { kind: "item", id: item.id };
    const isSelected = sameTarget(selected, target);
    const isDragging = isDraggingOverride ?? dragging?.id === item.id;
    const type = zone === "room" ? "take" : "drop";
    const displayName = count !== undefined ? t("inventory.stackCount", { item: names.itemOf(item), count }) : names.itemOf(item);
    return (
      <li key={key} className="item-slot">
        <Hint
          open={showSelectedHint && isSelected && !dragging}
          label={
            <>
              {displayName}
              <ConsumeEffects type={item.type} view={view} />
            </>
          }
        >
          <button type="button"
            aria-label={displayName}
            aria-pressed={isSelected}
            className={`item-tile${isSelected ? " selected" : ""}${isDragging ? " dragging" : ""}`}
            draggable
            onPointerDown={(e) => startTouch(e, item, zone)}
            onMouseDown={(e) => {
              if (e.shiftKey) e.preventDefault(); // no text selection from shift-click
            }}
            onClick={(e) => {
              if (press.current?.moved) {
                press.current = null; // the release of a touch drag, not a tap
                return;
              }
              press.current = null;
              // Shift-click is a desktop shortcut for Take/Drop; the server's legal list still decides.
              if (e.shiftKey && legal(type, item)) onAction({ type, item: item.id });
              else onSelect(target);
            }}
            onDragStart={(e) => {
              // A finger drags with pointer events (startTouch); the browser's own touch drag would be a second one.
              if (press.current) {
                e.preventDefault();
                return;
              }
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", names.itemOf(item));
              setDragging({ id: item.id, from: zone });
            }}
            onDragEnd={endDrag}
          >
            <ItemFace label={names.itemLabel(item)} count={count}>
              <ItemIcon className="item-icon" item={item} view={view} />
            </ItemFace>
          </button>
        </Hint>
        <ItemAttrIcons item={item} mpPenalty={view.config.heavyMpPenalty} />
      </li>
    );
  };

  return (
    <div className="self-cards" ref={root} tabIndex={-1}>
      <section {...zoneProps("room")} data-zone="room">
        <h2>{t("inventory.inRoom")}</h2>
        {sortedRoomStacks.length === 0 ? (
          <p className="sub">{t("inventory.nothingHere")}</p>
        ) : (
          <ul className="item-grid" ref={roomGrid.ref} data-compact={roomGrid.compact || undefined}>
            {sortedRoomStacks.map((stack) => {
              const rep = (selected.kind === "item" ? stack.items.find((i) => i.id === selected.id) : undefined) ?? stack.items[0]!;
              const count = stack.items.length > 1 ? stack.items.length : undefined;
              const isDragging = dragging !== null && stack.items.some((i) => i.id === dragging.id);
              return tile(rep, "room", stack.key, count, isDragging);
            })}
          </ul>
        )}
      </section>

      <section {...zoneProps("inventory")} data-zone="inventory">
        <h2>{t("inventory.title")}</h2>
        <ul className="item-grid">
          {sortedInventory.map((item) => tile(item, "inventory", item.id))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`empty-${i}`} className="item-slot">
              <span className="item-tile empty">
                <ItemFace>
                  <span className="kit-slot big" />
                </ItemFace>
              </span>
            </li>
          ))}
        </ul>
      </section>
      {ghost &&
        createPortal(
          <div className="item-drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
            <ItemFace>
              <ItemIcon className="item-icon" item={ghost.item} view={view} />
            </ItemFace>
          </div>,
          document.body,
        )}
    </div>
  );
}
