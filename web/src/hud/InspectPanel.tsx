// Left panel: whatever is selected (a person, room equipment, or an item),
// with the actions the server allows on it. Falls back to your own character.

import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { CHARACTERS, type Action, type PlayerView, type Target } from "@mush2/shared";
import { EMPTY_SLOT_ICON, characterImage, itemIcon, portrait } from "../art/assets.ts";
import { roomLabel } from "../scene/names.ts";
import { ActionLabel } from "./ActionLabel.tsx";
import { actionLabelKey, actionsOn, costOf, resolveTarget, type Resolved } from "./targets.ts";

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
  const labelFor = (a: Action): ReactNode => {
    const key = actionLabelKey(a);
    return <ActionLabel text={key ? t(key) : a.type} cost={costOf(view, a)} />;
  };
  const resolved = resolveTarget(view, target);
  const actions = actionsOn(view, target);

  return (
    <aside className="panel inspect">
      <div className="panel-head">
        <h2>Inspect</h2>
      </div>
      {resolved && <Details view={view} resolved={resolved} />}
      {actions.length > 0 && (
        <div className="inspect-actions">
          {actions.map((a) => (
            <button key={a.type} onClick={() => onAction(a)}>
              {labelFor(a)}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

/** Shows the bond between you and this person, if any. Both directions come from the view; nothing is computed here. */
function BondTag({ view, id }: { view: PlayerView; id: string }) {
  const { t } = useTranslation();
  const to = view.bonds.to.includes(id);
  const from = view.bonds.from.includes(id);
  if (!to && !from) return null;
  return <span className="tag">{t(to && from ? "bond.both" : to ? "bond.toThem" : "bond.fromThem")}</span>;
}

function Details({ view, resolved }: { view: PlayerView; resolved: Resolved }) {
  switch (resolved.kind) {
    case "player": {
      const { person } = resolved;
      const character = CHARACTERS.find((c) => c.id === person.character);
      const art = characterImage(person.character);
      return (
        <>
          {art ? (
            <img className="inspect-art" src={art} alt={character?.name ?? ""} />
          ) : (
            <img className="inspect-portrait" src={portrait(person.character)} alt="" />
          )}
          <div className="inspect-name">
            <strong>{person.name}</strong>
            {person.isBot && <span className="tag">AI</span>}
            {person.id === view.you.id && <span className="tag">you</span>}
            <BondTag view={view} id={person.id} />
            {character && <div className="sub">{character.name}</div>}
          </div>
        </>
      );
    }
    case "equipment":
      return (
        <div className="inspect-name">
          <strong>{resolved.equipment.name}</strong>
          <div className="sub">Equipment in {roomLabel(view.you.room)}</div>
        </div>
      );
    case "item":
      return (
        <>
          <img
            className="inspect-portrait inspect-item-icon"
            src={itemIcon(resolved.item.type) ?? EMPTY_SLOT_ICON}
            alt=""
          />
          <div className="inspect-name">
            <strong>{resolved.item.name}</strong>
            <div className="sub">{resolved.carried ? "In your inventory" : `In ${roomLabel(view.you.room)}`}</div>
          </div>
        </>
      );
  }
}
