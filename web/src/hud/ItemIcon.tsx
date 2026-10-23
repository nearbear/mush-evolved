import type { ItemView, PlayerView } from "@mush2/shared";
import { EMPTY_SLOT_ICON, itemViewIcon, lyingSprite } from "../art/assets.ts";

/** An item's icon. A corpse shows its owner lying down, as the cast sheet draws them, instead of a stock icon. */
export function ItemIcon({ item, view, className }: { item: ItemView; view: PlayerView; className: string }) {
  const character = item.of === undefined ? undefined : [view.you, ...view.players].find((p) => p.id === item.of)?.character;
  const lying = lyingSprite(character);
  if (!lying) return <img className={className} src={itemViewIcon(item) ?? EMPTY_SLOT_ICON} alt="" draggable={false} />;
  return (
    <div className={`${className} corpse-icon`}>
      <div className="corpse-sprite" style={lying} />
    </div>
  );
}
