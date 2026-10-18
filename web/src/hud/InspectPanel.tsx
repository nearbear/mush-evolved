// Left panel: whatever is selected (a person, room equipment, or an item),
// with the actions the server allows on it. Falls back to your own character.

import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import type { ReactNode } from "react";
import { actionVisibility, CHARACTERS, ITEM_TYPES, type Action, type BotKind, type EquipmentView, type OtherPlayerView, type PlayerView, type ShipLayout, type Target } from "@mush2/shared";
import { characterImage, portrait } from "../art/assets.ts";
import { atlasUrl } from "../iso/shipLayout.ts";
import { equipmentByTileKey } from "../iso/equipmentTiles.ts";
import { frameRect } from "../iso/placement.ts";
import { ItemFace } from "./ItemFace.tsx";
import { ItemIcon } from "./ItemIcon.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { SkillSlots } from "./SkillSlots.tsx";
import { ItemAttrIcons } from "./ItemAttrIcons.tsx";
import { StatusIcons } from "./StatusIcons.tsx";
import { DisabledActionButton } from "./ActionButton.tsx";
import { actionLabelKey, actionsOn, chanceOf, costOf, resolveTarget, unaffordableOn, type Resolved } from "./targets.ts";

export function InspectPanel({
  view,
  layout,
  target,
  onAction,
}: {
  view: PlayerView;
  /** For equipment sprites; without it equipment shows as text only. */
  layout?: ShipLayout;
  /** Already resolved against the view by the caller. */
  target: Target;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const labelFor = (a: Action, cost = costOf(view, a), chance = chanceOf(view, a)): ReactNode => {
    const key = actionLabelKey(a);
    return <ActionLabel text={key ? t(key) : a.type} cost={cost} chance={chance} visibility={actionVisibility(a.type)} />;
  };
  const resolved = resolveTarget(view, target);
  const actions = actionsOn(view, target);
  const blocked = unaffordableOn(view, target);

  return (
    <aside className="panel inspect">
      <div className="panel-head">
        <h2>Inspect</h2>
      </div>
      <div className="inspect-body">
      {resolved && (
        <div className="inspect-target">
          <Details view={view} layout={layout} resolved={resolved} onAction={onAction} />
        </div>
      )}
      {actions.length + blocked.length > 0 && (
        <div className="inspect-actions">
          {actions.map((a) => (
            <button key={a.type} onClick={() => onAction(a)}>
              {labelFor(a)}
            </button>
          ))}
          {blocked.map((u) => (
            <DisabledActionButton key={u.action.type} view={view} blocked={u}>
              {labelFor(u.action, u.cost, u.chance)}
            </DisabledActionButton>
          ))}
        </div>
      )}
      </div>
    </aside>
  );
}

function Details({ view, layout, resolved, onAction }: { view: PlayerView; layout?: ShipLayout; resolved: Resolved; onAction: (action: Action) => void }) {
  const { t } = useTranslation();
  const names = useNames();
  switch (resolved.kind) {
    case "player": {
      const { person } = resolved;
      const character = CHARACTERS.find((c) => c.id === person.character);
      const art = characterImage(person.character);
      const isYou = person.id === view.you.id;
      return (
        <div className="inspect-figure">
          {art ? (
            <img className="inspect-art" src={art} alt={character?.name ?? ""} />
          ) : (
            <img className="inspect-portrait" src={portrait(person.character)} alt="" />
          )}
          {character && <span className="inspect-figure-name">{character.name}</span>}
          <SkillSlots view={view} skills={person.skills} isYou={isYou} onAction={onAction} />
        </div>
      );
    }
    case "equipment":
      return (
        <>
          <EquipmentSprite view={view} layout={layout} equipment={resolved.equipment} />
          <div className="inspect-name">
            <strong>{names.equipment(resolved.equipment.type)}</strong>
            <div className="sub">Equipment in {names.room(view.you.room)}</div>
          </div>
        </>
      );
    case "item":
      return (
        <div className="inspect-item">
          <ItemFace label={names.item(resolved.item.type, resolved.item.builds)}>
            <ItemIcon className="item-icon" item={resolved.item} view={view} />
          </ItemFace>
        </div>
      );
  }
}

/** The sprite the room draws for this equipment, scaled to the column width (like the item face, sized off `--tile`). */
function EquipmentSprite({ view, layout, equipment }: { view: PlayerView; layout?: ShipLayout; equipment: EquipmentView }) {
  const names = useNames();
  const room = layout?.rooms.find((r) => r.id === view.you.room);
  const entry = [...equipmentByTileKey(room, view.roomEquipment)].find(([, e]) => e.id === equipment.id);
  const tile = room?.tiles[Number(entry?.[0].slice(1))];
  const slice = tile && layout?.slices[tile.slice];
  const sheet = slice && layout?.sheets[slice.sheet];
  const url = layout && slice && atlasUrl(layout, slice.sheet);
  if (!tile || !slice || !sheet || !url) return null;
  const { sx, sy } = frameRect(slice, tile.frame);
  const w = slice.width;
  return (
    <div className="inspect-sprite-box">
      <div
        className="inspect-sprite"
        role="img"
        aria-label={names.equipment(equipment.type)}
        style={{
          aspectRatio: `${w} / ${slice.height}`,
          backgroundImage: `url(${url})`,
          backgroundSize: `${sheet.width / w}em ${sheet.height / w}em`,
          backgroundPosition: `${-sx / w}em ${-sy / w}em`,
          transform: slice.flipX || slice.flipY ? `scale(${slice.flipX ? -1 : 1}, ${slice.flipY ? -1 : 1})` : undefined,
        }}
      />
    </div>
  );
}
