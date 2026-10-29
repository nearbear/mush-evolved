// Left panel: whatever is selected (a person, room equipment, or an item),
// with the actions the server allows on it. Falls back to your own character. The asset credits close the panel.

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import type { CSSProperties, ReactNode } from "react";
import { actionVisibility, CHARACTERS, characterGivenName, characterName, type Action, type ActionOption, type EquipmentView, type PlayerView, type ShipLayout, type Target } from "@mush2/shared";
import { characterImage, CONTAMINATED_ICON, portrait } from "../art/assets.ts";
import { useMobile } from "../useMobile.ts";
import { atlasUrl } from "../iso/shipLayout.ts";
import { equipmentByTileKey, roomAsBuilt } from "../iso/equipmentTiles.ts";
import { frameRect } from "../iso/placement.ts";
import { ItemFace } from "./ItemFace.tsx";
import { PlantStates } from "./PlantStates.tsx";
import { ItemIcon } from "./ItemIcon.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { SkillSlots } from "./SkillSlots.tsx";
import { StatusIcon, StatusIcons } from "./StatusIcons.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { useKeepFocus } from "./useKeepFocus.ts";
import { attackWeapon, optionsOn, resolveTarget, type Resolved } from "./targets.ts";

export function InspectPanel({
  view,
  layout,
  target,
  onAction,
  onDeselect,
}: {
  view: PlayerView;
  /** For equipment sprites; without it equipment shows as text only. */
  layout?: ShipLayout;
  /** Already resolved against the view by the caller. */
  target: Target;
  onAction: (action: Action) => void;
  /** Clears the selection; given only while something other than yourself is selected. */
  onDeselect?: () => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const mobile = useMobile();
  const deselect = onDeselect && (
    <button type="button" className="inspect-deselect" onClick={onDeselect}>
      {t("inspect.deselect")}
    </button>
  );
  const labelFor = ({ action, cost, chance }: ActionOption): ReactNode => {
    const weapon = attackWeapon(view, action);
    const text = weapon ? t("actions.attackWith", { weapon: names.itemOf(weapon) }) : names.action(action.type);
    return <ActionLabel text={text} cost={cost} chance={chance} visibility={actionVisibility(action.type)} />;
  };
  const resolved = resolveTarget(view, target);
  const options = optionsOn(view, target);
  const root = useRef<HTMLElement>(null);
  useKeepFocus(root);
  const targetName =
    resolved?.kind === "player"
      ? names.character(resolved.person.character)
      : resolved?.kind === "equipment"
        ? names.equipment(resolved.equipment.type)
        : resolved
          ? names.itemOf(resolved.item)
          : undefined;

  return (
    <aside className="panel inspect" ref={root} tabIndex={-1}>
      <div className="panel-head">
        <h2>{t("nav.inspect")}</h2>
        {!mobile && deselect}
      </div>
      <div className="inspect-body">
      {resolved && (
        <div className="inspect-target">
          <Details view={view} layout={layout} resolved={resolved} onAction={onAction} />
          {mobile && deselect}
        </div>
      )}
      {options.length > 0 && (
        <div className="inspect-actions" role="group" aria-label={targetName}>
          {options.map((o) => (
            <ActionButton key={JSON.stringify(o.action)} view={view} option={o} onAction={onAction}>
              {labelFor(o)}
            </ActionButton>
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
  const mobile = useMobile();
  switch (resolved.kind) {
    case "player": {
      const { person } = resolved;
      const character = CHARACTERS.find((c) => c.id === person.character);
      const art = characterImage(person.character);
      const isYou = person.id === view.you.id;
      // The phone layout shows only the given name, to keep the figure label short.
      const displayName = mobile ? characterGivenName(person.character) : characterName(person.character);
      return (
        <div className="inspect-figure">
          <div className="inspect-figure-art">
            {art ? (
              <img className="inspect-art" src={art} alt={character ? displayName : ""} />
            ) : (
              <img className="inspect-portrait" src={portrait(person.character)} alt="" />
            )}
            {character && <span className="inspect-figure-name">{displayName}</span>}
            <SkillSlots view={view} skills={person.skills} bookSkill={person.bookSkill} isYou={isYou} onAction={onAction} />
            <StatusIcons statuses={isYou ? view.statuses : person.statuses} contamination={"contamination" in person ? person.contamination : undefined} />
          </div>
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
            {resolved.equipment.out && <div className="sub">{t(resolved.equipment.destroyed ? "patrol.destroyed" : "patrol.out")}</div>}
            {resolved.equipment.armor !== undefined && <div className="sub">{t("patrol.armor", { armor: resolved.equipment.armor, max: resolved.equipment.maxArmor })}</div>}
          </div>
        </>
      );
    case "item":
      return (
        <>
          <div className="inspect-item">
            <ItemFace label={names.itemLabel(resolved.item)}>
              <ItemIcon className="item-icon" item={resolved.item} view={view} />
            </ItemFace>
          </div>
          <div className="inspect-name inspect-item-name">
            <strong>{names.itemOf(resolved.item)}</strong>
          </div>
          {resolved.item.plant && <PlantStates plant={resolved.item.plant} />}
          {resolved.item.spores !== undefined && (
            <ul className="status-icons" aria-label={t("itemAttr.label")}>
              <li className="status-count">
                <StatusIcon icon={CONTAMINATED_ICON} name={t("itemAttr.contaminated", { level: resolved.item.spores })} description={t("itemAttr.contaminatedDesc")} visibility="private">
                  <span aria-hidden="true">{resolved.item.spores}</span>
                </StatusIcon>
              </li>
            </ul>
          )}
          {resolved.item.charges !== undefined && <div className="sub inspect-charges">{t("itemAttr.charges", { count: resolved.item.charges })}</div>}
        </>
      );
  }
}

/** The sprite the room draws for this equipment, scaled to the column width (like the item face, sized off `--tile`). */
function EquipmentSprite({ view, layout, equipment }: { view: PlayerView; layout?: ShipLayout; equipment: EquipmentView }) {
  const names = useNames();
  const mapRoom = layout?.rooms.find((r) => r.id === view.you.room);
  const room = mapRoom && roomAsBuilt(mapRoom, view.roomEquipment);
  const entry = [...equipmentByTileKey(room, view.roomEquipment)].find(([, e]) => e.id === equipment.id);
  const tile = room?.tiles[Number(entry?.[0].slice(1))];
  const slice = tile && layout?.slices[tile.slice];
  const sheet = slice && layout?.sheets[slice.sheet];
  const url = layout && slice && atlasUrl(layout, slice.sheet);
  if (!tile || !slice || !sheet || !url) return null;
  const { sx, sy } = frameRect(slice, tile.frame);
  const w = slice.width;
  return (
    <div className="inspect-sprite-box" style={{ "--ratio": w / slice.height } as CSSProperties}>
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
