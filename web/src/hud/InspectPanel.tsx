// Left panel: whatever is selected (a person, room equipment, or an item),
// with the actions the server allows on it. Falls back to your own character.

import { CHARACTERS, type Action, type PlayerView, type Target } from "@mush2/shared";
import { EMPTY_SLOT_ICON, characterImage, itemIcon, portrait } from "../art/assets.ts";
import { roomLabel } from "../scene/names.ts";
import { actionLabel, actionsOn, resolveTarget, type Resolved } from "./targets.ts";

export function InspectPanel({
  view,
  target,
  onAction,
  onClose,
}: {
  view: PlayerView;
  /** Already resolved against the view by the caller. */
  target: Target;
  onAction: (action: Action) => void;
  onClose: () => void;
}) {
  const resolved = resolveTarget(view, target);
  const isSelf = target.kind === "player" && target.id === view.you.id;
  const actions = actionsOn(view, target);

  return (
    <aside className="panel inspect">
      <div className="panel-head">
        <h2>Inspect</h2>
        {!isSelf && (
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>
      {resolved && <Details view={view} resolved={resolved} />}
      {actions.length > 0 && (
        <div className="inspect-actions">
          {actions.map((a) => (
            <button key={a.type} onClick={() => onAction(a)}>
              {actionLabel(a)}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
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
            {character && <div className="sub">{character.name}</div>}
          </div>
          <dl className="inspect-facts">
            <dt>Location</dt>
            <dd>{roomLabel(person.room)}</dd>
            <dt>Status</dt>
            <dd>{!person.alive ? "Dead" : person.ready ? "Done for this cycle" : "Active"}</dd>
          </dl>
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
