// Left panel: whatever is selected (a person, room equipment, or an item),
// with the actions the server allows on it. Falls back to your own character.

import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import type { ReactNode } from "react";
import { actionVisibility, CHARACTERS, ITEM_TYPES, type Action, type BotKind, type OtherPlayerView, type PlayerView, type Target } from "@mush2/shared";
import { characterImage, portrait } from "../art/assets.ts";
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
  target,
  onAction,
}: {
  view: PlayerView;
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
      {resolved && <Details view={view} resolved={resolved} onAction={onAction} />}
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
    </aside>
  );
}

function Details({ view, resolved, onAction }: { view: PlayerView; resolved: Resolved; onAction: (action: Action) => void }) {
  const { t } = useTranslation();
  const names = useNames();
  switch (resolved.kind) {
    case "player": {
      const { person } = resolved;
      const character = CHARACTERS.find((c) => c.id === person.character);
      const art = characterImage(person.character);
      const isYou = person.id === view.you.id;
      return (
        <>
          <div className="inspect-figure">
            {art ? (
              <img className="inspect-art" src={art} alt={character?.name ?? ""} />
            ) : (
              <img className="inspect-portrait" src={portrait(person.character)} alt="" />
            )}
            {character && <span className="inspect-figure-name">{character.name}</span>}
            <SkillSlots view={view} skills={person.skills} isYou={isYou} onAction={onAction} />
          </div>
          <div className="inspect-name">
            {person.id === view.you.id ? (
              <StatusIcons statuses={view.statuses} />
            ) : (
              <StatusIcons statuses={(person as OtherPlayerView).statuses} contamination={(person as OtherPlayerView).contamination} />
            )}
          </div>
        </>
      );
    }
    case "equipment":
      return (
        <div className="inspect-name">
          <strong>{names.equipment(resolved.equipment.type)}</strong>
          <div className="sub">Equipment in {names.room(view.you.room)}</div>
        </div>
      );
    case "item":
      return (
        <>
          <div className="inspect-item">
            <ItemFace label={names.item(resolved.item.type, resolved.item.builds)}>
              <ItemIcon className="item-icon" item={resolved.item} view={view} />
            </ItemFace>
          </div>
          <div className="inspect-name">
            <ItemAttrIcons heavy={ITEM_TYPES[resolved.item.type]?.heavy === true} mpPenalty={view.config.heavyMpPenalty} />
          </div>
        </>
      );
  }
}
