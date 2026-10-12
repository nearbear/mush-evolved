// Your inventory slots and the items stored in your room. Take/drop buttons
// appear only for actions the server listed as legal.

import type { Action, ItemView, PlayerView } from "@mush2/shared";

export function InventoryPanel({ view, onAction }: { view: PlayerView; onAction: (action: Action) => void }) {
  const legal = (type: "take" | "drop", item: ItemView) =>
    view.legalActions.some((a) => a.type === type && a.item === item.id);
  const empty = Math.max(0, view.inventorySlots - view.inventory.length);

  return (
    <aside className="panel inventory">
      <h2>Inventory</h2>
      <ul className="item-list">
        {view.inventory.map((item) => (
          <li key={item.id}>
            <span>{item.name}</span>
            {legal("drop", item) && <button onClick={() => onAction({ type: "drop", item: item.id })}>Drop</button>}
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} className="sub">
            Empty slot
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
              <span>{item.name}</span>
              {legal("take", item) && <button onClick={() => onAction({ type: "take", item: item.id })}>Take</button>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
