// The items stored in your room (left) and your inventory slots (right), as square icon tiles; the
// full name is a tooltip (and the peek bar on touch), and only skill books carry a label, their
// skill. Drag a tile between the two zones to take or drop it; the zones light up only when the server listed that action as legal. Tapping a tile inspects it and, for touch
// (which has no reliable drag), shows a Take/Drop button on the selected tile. Shift-click on a
// tile takes or drops it directly. That button fires on one press whatever the "single press" setting: selecting the
// tile first already makes it a two-step action (owner, 2026-11-27).

import { useEffect, useRef, useState } from "react";
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
  const dropOn = (zone: Zone) => {
    if (dragging && accepts(zone)) onAction({ type: zone === "inventory" ? "take" : "drop", item: dragging.id });
    setDragging(null);
    setOver(null);
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
            onMouseDown={(e) => {
              if (e.shiftKey) e.preventDefault(); // no text selection from shift-click
            }}
            onClick={(e) => {
              // Shift-click is a desktop shortcut for Take/Drop; the server's legal list still decides.
              if (e.shiftKey && legal(type, item)) onAction({ type, item: item.id });
              else onSelect(target);
            }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", names.itemOf(item));
              setDragging({ id: item.id, from: zone });
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
          >
            <ItemFace label={names.itemLabel(item)} count={count}>
              <ItemIcon className="item-icon" item={item} view={view} />
            </ItemFace>
          </button>
        </Hint>
        <ItemAttrIcons item={item} mpPenalty={view.config.heavyMpPenalty} />
        {isSelected && legal(type, item) && (
          <button type="button" className="item-action" aria-label={`${zone === "room" ? t("actions.take") : t("actions.drop")} ${names.itemOf(item)}`} onClick={() => onAction({ type, item: item.id })}>
            {zone === "room" ? t("actions.take") : t("actions.drop")}
          </button>
        )}
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
    </div>
  );
}
