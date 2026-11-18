// The items stored in your room (left) and your inventory slots (right), as square icon tiles; the
// full name is a tooltip (and the peek bar on touch), and only skill books carry a label, their
// skill. Drag a tile between the two zones to take or drop it; the zones light up only when the server listed that action as legal. Tapping a tile inspects it and, for touch
// (which has no reliable drag), shows a Take/Drop button on the selected tile. Shift-click on a
// tile takes or drops it directly.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { legalIn, type Action, type ItemView, type PlayerView, type Target } from "@mush2/shared";
import { Hint } from "./IconButton.tsx";
import { ConsumeEffects } from "./ConsumeEffects.tsx";
import { DoublePressButton } from "./DoublePress.tsx";
import { ItemAttrIcons } from "./ItemAttrIcons.tsx";
import { ItemFace } from "./ItemFace.tsx";
import { ItemIcon } from "./ItemIcon.tsx";
import { sameTarget } from "./targets.ts";
import { useKeepFocus } from "./useKeepFocus.ts";

type Zone = "room" | "inventory";

// Keep in sync with --tile's default and the grid gap in styles/items.css.
const TILE = 76;
const GAP = 6;

/** True when the items wouldn't fit one row of full-size tiles in the grid's width (the grid then shrinks its tiles). */
function useOverflowsRow(count: number) {
  const hasGrid = count > 0; // the grid unmounts when empty, so re-attach the observer when it returns
  const ref = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(Infinity);
  useEffect(() => {
    const el = ref.current;
    if (!hasGrid || !el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [hasGrid]);
  return { ref, compact: count > Math.max(1, Math.floor((width + GAP) / (TILE + GAP))) };
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

  const root = useRef<HTMLDivElement>(null);
  useKeepFocus(root);
  const roomGrid = useOverflowsRow(view.roomItems.length);

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

  const tile = (item: ItemView, zone: Zone) => {
    const target: Target = { kind: "item", id: item.id };
    const isSelected = sameTarget(selected, target);
    const type = zone === "room" ? "take" : "drop";
    return (
      <li key={item.id} className="item-slot">
        <Hint
          label={
            <>
              {names.itemOf(item)}
              <ConsumeEffects type={item.type} view={view} />
            </>
          }
        >
          <button type="button"
            aria-label={names.itemOf(item)}
            aria-pressed={isSelected}
            className={`item-tile${isSelected ? " selected" : ""}${dragging?.id === item.id ? " dragging" : ""}`}
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
            <ItemFace label={names.itemLabel(item)}>
              <ItemIcon className="item-icon" item={item} view={view} />
            </ItemFace>
          </button>
        </Hint>
        <ItemAttrIcons item={item} mpPenalty={view.config.heavyMpPenalty} />
        {isSelected && legal(type, item) && (
          <DoublePressButton className="item-action" aria-label={`${zone === "room" ? t("actions.take") : t("actions.drop")} ${names.itemOf(item)}`} onPress={() => onAction({ type, item: item.id })}>
            {zone === "room" ? t("actions.take") : t("actions.drop")}
          </DoublePressButton>
        )}
      </li>
    );
  };
  const byName = (items: ItemView[]) => [...items].sort((a, b) => names.itemOf(a).localeCompare(names.itemOf(b), i18n.language));
  const sortedInventory = byName(view.inventory);
  const sortedRoomItems = byName(view.roomItems);
  const empty = Math.max(0, view.inventorySlots - view.inventory.length);

  return (
    <div className="self-cards" ref={root} tabIndex={-1}>
      <section {...zoneProps("room")} data-zone="room">
        <h2>{t("inventory.inRoom")}</h2>
        {view.roomItems.length === 0 ? (
          <p className="sub">{t("inventory.nothingHere")}</p>
        ) : (
          <ul className="item-grid" ref={roomGrid.ref} data-compact={roomGrid.compact || undefined}>
            {sortedRoomItems.map((item) => tile(item, "room"))}
          </ul>
        )}
      </section>

      <section {...zoneProps("inventory")} data-zone="inventory">
        <h2>{t("inventory.title")}</h2>
        <ul className="item-grid">
          {sortedInventory.map((item) => tile(item, "inventory"))}
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
