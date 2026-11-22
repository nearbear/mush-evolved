// Left panel: whatever is selected (a person, room equipment, or an item),
// with the actions the server allows on it. Falls back to your own character. The asset credits close the panel.

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import type { CSSProperties, ReactNode } from "react";
import { actionVisibility, CHARACTERS, ITEM_TYPES, PROJECT_COMPLETE, characterGivenName, characterName, SUPER_CALC_EQUIPMENT, SUPERKUBE, type Action, type ActionOption, type EquipmentView, type PlayerView, type ShipLayout, type Target } from "@mush2/shared";
import { BROKEN_ICON, characterImage, portrait } from "../art/assets.ts";
import { useMobile } from "../useMobile.ts";
import { atlasUrl } from "../iso/shipLayout.ts";
import { equipmentByTileKey, roomAsBuilt } from "../iso/equipmentTiles.ts";
import { frameRect } from "../iso/placement.ts";
import { ItemFace } from "./ItemFace.tsx";
import { ItemAttrIcons, thingMarkIcons } from "./ItemAttrIcons.tsx";
import { PlantStates } from "./PlantStates.tsx";
import { ItemIcon } from "./ItemIcon.tsx";
import { DocumentReader } from "./DocumentDialog.tsx";
import { SuperkubeOpener, type SendKube } from "./Superkube.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { SkillSlots } from "./SkillSlots.tsx";
import { StatusIcon, StatusIcons } from "./StatusIcons.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { collapsePickers, CrewPickerDialog, isPickerAction, type PickerAction } from "./CrewPickerDialog.tsx";
import { collapseThrowOut, ThrowOutDialog } from "./ThrowOutDialog.tsx";
import { useKeepFocus } from "./useKeepFocus.ts";
import { attackWeapon, graftFruit, optionsOn, resolveTarget, type Resolved } from "./targets.ts";

export function InspectPanel({
  view,
  layout,
  target,
  onAction,
  onDeselect,
  onKube,
}: {
  view: PlayerView;
  /** For equipment sprites; without it equipment shows as text only. */
  layout?: ShipLayout;
  /** Already resolved against the view by the caller. */
  target: Target;
  onAction: (action: Action) => void;
  /** Clears the selection; given only while something other than yourself is selected. */
  onDeselect?: () => void;
  /** Sends a Superkube option (#170); given only while cheats are allowed, so only then does the Superkube open. */
  onKube?: SendKube | undefined;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const mobile = useMobile();
  // Phones only: desktop clears a selection by clicking elsewhere in the room.
  const deselect = mobile && onDeselect && (
    <button type="button" className="inspect-deselect" onClick={onDeselect}>
      {t("inspect.deselect")}
    </button>
  );
  const labelFor = ({ action, cost, chance }: ActionOption): ReactNode => {
    const weapon = attackWeapon(view, action);
    const fruit = graftFruit(view, action);
    const text = weapon
      ? t("actions.attackWith", { weapon: names.itemOf(weapon) })
      : fruit
        ? t("actions.graftWith", { fruit: names.itemOf(fruit) })
      : action.type === "apprenticeship"
        ? t("actions.apprenticeshipOf", { skill: names.skill(action.skill) })
        : action.type === "upgrade_drone"
          ? t("actions.upgradeDroneWith", { upgrade: names.droneUpgrade(action.upgrade) })
          : names.action(action.type);
    return <ActionLabel text={text} cost={cost} chance={chance} visibility={actionVisibility(action.type, view)} />;
  };
  const [throwingOut, setThrowingOut] = useState(false);
  const [picking, setPicking] = useState<PickerAction | null>(null);
  const resolved = resolveTarget(view, target);
  const { options: afterThrowOut, throwOut } = collapseThrowOut(optionsOn(view, target));
  const { options, picks } = collapsePickers(afterThrowOut);
  // A printed document's Read (#394) is client-only, so it is not one of the options, but it sits with them.
  const doc = resolved?.kind === "item" ? resolved.item.document : undefined;
  // The Superkube's Open (#170) is a cheat, not an action, so it isn't one of the options either.
  const kube = onKube && resolved?.kind === "equipment" && resolved.equipment.type === SUPERKUBE ? onKube : undefined;
  const root = useRef<HTMLElement>(null);
  useKeepFocus(root);
  const targetName =
    resolved?.kind === "player"
      ? names.character(resolved.person.character)
      : resolved?.kind === "equipment"
        ? names.equipment(resolved.equipment.type)
        : resolved?.kind === "door"
          ? t("peek.doorTo", { room: names.room(resolved.door.to) })
          : resolved
            ? names.itemOf(resolved.item)
            : undefined;

  return (
    <aside className="panel inspect" ref={root} tabIndex={-1}>
      <div className="panel-head">
        <h2>{t("nav.inspect")}</h2>
      </div>
      <div className="inspect-body">
      {resolved && (
        <div className="inspect-target">
          <Details view={view} layout={layout} resolved={resolved} onAction={onAction} />
        </div>
      )}
      {(options.length > 0 || doc || kube || deselect) && (
        <div className="inspect-actions" role="group" aria-label={targetName}>
          {deselect}
          {doc && <DocumentReader document={doc} />}
          {kube && <SuperkubeOpener view={view} onKube={kube} />}
          {options.map((o) => (
            <ActionButton
              key={JSON.stringify(o.action)}
              view={view}
              option={o}
              onAction={
                o.action.type === "throw_out"
                  ? () => setThrowingOut(true)
                  : isPickerAction(o.action.type)
                    ? () => setPicking(o.action.type as PickerAction)
                    : onAction
              }
            >
              {labelFor(o)}
            </ActionButton>
          ))}
        </div>
      )}
      {targetName && (
        <ThrowOutDialog
          open={throwingOut}
          targetName={targetName}
          options={throwOut}
          onClose={() => setThrowingOut(false)}
          onAction={onAction}
        />
      )}
      <CrewPickerDialog
        kind={picking}
        view={view}
        picks={picks}
        onClose={() => setPicking(null)}
        onAction={onAction}
      />
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
      const whoName = (id: string | undefined): string | undefined => {
        if (!id) return undefined;
        const match = id === view.you.id ? view.you : view.players.find((o) => o.id === id);
        return match ? characterName(match.character) : undefined;
      };
      const protectingName = whoName(isYou ? view.you.protecting : person.protecting);
      const protectedByName = whoName(isYou ? view.you.protectedBy : person.protectedBy);
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
            <StatusIcons
              statuses={isYou ? view.statuses : person.statuses}
              contamination={"contamination" in person ? person.contamination : undefined}
              protecting={protectingName}
              protectedBy={protectedByName}
            />
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
            {resolved.equipment.broken && (
              <div className="sub inspect-broken">
                <img src={BROKEN_ICON} alt="" /> {t("roomList.broken")}
              </div>
            )}
            <ThingMarks jelly={resolved.equipment.jelly} shield={resolved.equipment.shield} />
            {resolved.equipment.out && <div className="sub">{t(resolved.equipment.type === "ICARUS_COMMAND" ? "expedition.icarusAway" : resolved.equipment.destroyed ? "patrol.destroyed" : "patrol.out")}</div>}
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
            <ItemAttrIcons item={resolved.item} mpPenalty={view.config.heavyMpPenalty} />
          </div>
          <div className="inspect-name inspect-item-name">
            <strong>{names.itemOf(resolved.item)}</strong>
            {resolved.item.drone && <div className="sub inspect-drone">{names.drone(resolved.item.drone.name, resolved.item.drone.serial)}</div>}
            {ITEM_TYPES[resolved.item.type]?.notImplemented && <div className="sub">{t("itemAttr.notImplemented")}</div>}
          </div>
          {resolved.item.broken && (
            <div className="sub inspect-broken">
              <img src={BROKEN_ICON} alt="" /> {t("roomList.broken")}
            </div>
          )}
          {resolved.item.plant && <PlantStates plant={resolved.item.plant} view={view} icons={false} />}
          {resolved.item.drone && <DroneUpgrades upgrades={resolved.item.drone.upgrades} />}
        </>
      );
    case "door":
      return (
        <>
          <div className="inspect-name">
            <strong>{t("peek.doorTo", { room: names.room(resolved.door.to) })}</strong>
          </div>
          {resolved.door.broken && (
            <div className="sub inspect-broken">
              <img src={BROKEN_ICON} alt="" /> {t("roomList.broken")}
            </div>
          )}
        </>
      );
  }
}

/** A drone's upgrades (#412), public to anyone who examines it, or "No upgrades". */
function DroneUpgrades({ upgrades }: { upgrades: readonly string[] }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  if (upgrades.length === 0) return <div className="sub inspect-drone-upgrades">{t("itemAttr.droneNoUpgrades")}</div>;
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(upgrades.map((id) => names.droneUpgrade(id)));
  return <div className="sub inspect-drone-upgrades">{t("itemAttr.droneUpgrades", { upgrades: list })}</div>;
}

/** The sprite the room draws for this equipment, scaled to the column width (like the item face, sized off `--tile`). */
/**
 * Icons with a count badge and a popover for what only some players see on an item or equipment (the server sends each
 * field only to them): spores on food and green jelly (Mush), shielding (Engineers and Mush). Like the status icons.
 */
function ThingMarks({ jelly, shield, spores }: { jelly?: number | undefined; shield?: number | undefined; spores?: number | undefined }) {
  const { t } = useTranslation();
  const marks = thingMarkIcons({ jelly, shield, spores }, t);
  if (marks.length === 0) return null;
  return (
    <ul className="status-icons" aria-label={t("itemAttr.label")}>
      {marks.map((mark) => (
        <li key={mark.key} className="status-count">
          <StatusIcon icon={mark.icon} name={mark.name} description={mark.description} visibility="private">
            <span aria-hidden="true">{mark.count}</span>
          </StatusIcon>
        </li>
      ))}
    </ul>
  );
}

function EquipmentSprite({ view, layout, equipment }: { view: PlayerView; layout?: ShipLayout; equipment: EquipmentView }) {
  const names = useNames();
  const mapRoom = layout?.rooms.find((r) => r.id === view.you.room);
  const room = mapRoom && roomAsBuilt(mapRoom, view.roomEquipment);
  const entry = [...equipmentByTileKey(room, view.roomEquipment)].find(([, e]) => e.id === equipment.id);
  const tile = room?.tiles[Number(entry?.[0].slice(1))];
  const rawSlice = equipment.type === SUPER_CALC_EQUIPMENT ? "server_active" : tile?.slice;
  const sliceName =
    rawSlice === "auxiliary_terminal_neron" && (view.projects.AUXILIARY_TERMINAL ?? 0) >= PROJECT_COMPLETE
      ? (view.projects.NERON_PROJECT_THREAD ?? 0) >= PROJECT_COMPLETE
        ? "auxiliary_terminal_neron_upgrade_b"
        : "auxiliary_terminal_neron_upgrade_a"
      : rawSlice;
  const slice = sliceName ? layout?.slices[sliceName] : undefined;
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
