// Your inventory slots and the items stored in your room. Take/drop buttons
// appear only for actions the server listed as legal; clicking a name inspects it.

import type { Action, ItemView, PlayerView, Target } from "@mush2/shared";
import { EMPTY_SLOT_ICON, itemIcon } from "../art/assets.ts";
import { sameTarget } from "./targets.ts";

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
  const legal = (type: "take" | "drop", item: ItemView) =>
    view.legalActions.some((a) => a.type === type && a.item === item.id);
  const name = (item: ItemView) => {
    const target: Target = { kind: "item", id: item.id };
    return (
      <button className={`item-name${sameTarget(selected, target) ? " selected" : ""}`} onClick={() => onSelect(target)}>
        <img className="item-icon" src={itemIcon(item.type) ?? EMPTY_SLOT_ICON} alt="" />
        {item.name}
      </button>
    );
  };
  const empty = Math.max(0, view.inventorySlots - view.inventory.length);

  return (
    <aside className="panel inventory">
      <h2>Inventory</h2>
      <ul className="item-list">
        {view.inventory.map((item) => (
          <li key={item.id}>
            {name(item)}
            {legal("drop", item) && <button onClick={() => onAction({ type: "drop", item: item.id })}>Drop</button>}
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} className="sub">
            <span className="item-name">
              <img className="item-icon" src={EMPTY_SLOT_ICON} alt="" />
              Empty slot
            </span>
          </li>
        ))}
      </ul>

      <h3>In this room</h3>
      {view.roomItems.length === 0 ? (
        <p className="sub">Nothing here.</p>
      ) : (
        <ul className="item-list">
          {view.roomItems.map((item) => (
            <li key={item.id}>
              {name(item)}
              {legal("take", item) && <button onClick={() => onAction({ type: "take", item: item.id })}>Take</button>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
