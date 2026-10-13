// The items stored in your room (left) and your inventory slots (right), as square tiles with the
// name inside at the bottom. Drag a tile between the two zones to take or drop it; the zones light
// up only when the server listed that action as legal. Tapping a tile inspects it and, for touch
// (which has no reliable drag), shows a Take/Drop button on the selected tile.

import { useState } from "react";
import type { Action, ItemView, PlayerView, Target } from "@mush2/shared";
import { EMPTY_SLOT_ICON, itemIcon } from "../art/assets.ts";
import { sameTarget } from "./targets.ts";

type Zone = "room" | "inventory";

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
  const [dragging, setDragging] = useState<{ id: string; from: Zone } | null>(null);
  const [over, setOver] = useState<Zone | null>(null);

  const legal = (type: "take" | "drop", item: ItemView) =>
    view.legalActions.some((a) => a.type === type && a.item === item.id);
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
        <button
          className={`item-tile${isSelected ? " selected" : ""}${dragging?.id === item.id ? " dragging" : ""}`}
          draggable
          title={item.name}
          onClick={() => onSelect(target)}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", item.name);
            setDragging({ id: item.id, from: zone });
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
        >
          <img className="item-icon" src={itemIcon(item.type) ?? EMPTY_SLOT_ICON} alt="" draggable={false} />
          <span className="item-label">{item.name}</span>
        </button>
        {isSelected && legal(type, item) && (
          <button className="item-action" onClick={() => onAction({ type, item: item.id })}>
            {zone === "room" ? "Take" : "Drop"}
          </button>
        )}
      </li>
    );
  };
  const empty = Math.max(0, view.inventorySlots - view.inventory.length);

  return (
    <>
      <section {...zoneProps("room")}>
        <h2>In this room</h2>
        {view.roomItems.length === 0 ? (
          <p className="sub">Nothing here.</p>
        ) : (
          <ul className="item-grid">{view.roomItems.map((item) => tile(item, "room"))}</ul>
        )}
      </section>

      <section {...zoneProps("inventory")}>
        <h2>Inventory</h2>
        <ul className="item-grid">
          {view.inventory.map((item) => tile(item, "inventory"))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`empty-${i}`} className="item-slot">
              <span className="item-tile empty">
                <img className="item-icon" src={EMPTY_SLOT_ICON} alt="" />
                <span className="item-label">Empty slot</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
