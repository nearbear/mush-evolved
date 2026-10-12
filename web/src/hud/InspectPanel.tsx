// Left panel. For now it inspects one crew member; more will live here later.

import { CHARACTERS, type PlayerView } from "@mush2/shared";
import { portrait } from "../art/assets.ts";
import { roomLabel } from "../scene/names.ts";

export function InspectPanel({
  view,
  selectedId,
  onClose,
}: {
  view: PlayerView;
  selectedId: string | null;
  onClose: () => void;
}) {
  const person = selectedId === view.you.id ? view.you : view.players.find((p) => p.id === selectedId);
  if (!person) {
    return (
      <aside className="panel inspect">
        <h2>Inspect</h2>
        <p className="sub">Click someone in the room to inspect them.</p>
      </aside>
    );
  }
  const character = CHARACTERS.find((c) => c.id === person.character);
  return (
    <aside className="panel inspect">
      <div className="panel-head">
        <h2>Inspect</h2>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="inspect-card">
        <img className="inspect-portrait" src={portrait(person.character)} alt="" />
        <div>
          <strong>{person.name}</strong>
          {person.isBot && <span className="tag">AI</span>}
          {person.id === view.you.id && <span className="tag">you</span>}
          {character && <div className="sub">{character.name}</div>}
        </div>
      </div>
      <dl className="inspect-facts">
        <dt>Location</dt>
        <dd>{roomLabel(person.room)}</dd>
        <dt>Status</dt>
        <dd>{!person.alive ? "Dead" : person.ready ? "Done for this cycle" : "Active"}</dd>
      </dl>
    </aside>
  );
}
