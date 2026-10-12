import { CHARACTERS, type PlayerView } from "@mush2/shared";
import { AP_PIP, HP_PIP, MORALE_PIP, MP_PIP, portrait } from "../art/assets.ts";
import { PipBar } from "./PipBar.tsx";

export function TopBar({
  view,
  canReady,
  onReady,
  onLeave,
}: {
  view: PlayerView;
  canReady: boolean;
  onReady: () => void;
  onLeave: () => void;
}) {
  const { you } = view;
  const character = CHARACTERS.find((c) => c.id === you.character);
  return (
    <header className="top-bar">
      <img className="avatar" src={portrait(you.character)} alt="" />
      <div>
        <strong>{you.name}</strong>
        {character && <div className="sub">{character.name}</div>}
      </div>
      <span className={`role ${you.role}`}>{you.role}</span>
      <div className="stat-stack">
        <PipBar label="AP" value={you.ap} max={view.maxAp} pip={AP_PIP} />
        <PipBar label="MP" value={you.mp} max={view.movement.mpCap} pip={MP_PIP} />
      </div>
      <div className="stat-stack">
        <PipBar label="HP" value={you.hp} max={view.maxHp} pip={HP_PIP} thin />
        <PipBar label="Morale" value={you.morale} max={view.maxMorale} pip={MORALE_PIP} thin />
      </div>
      <span className="cycle">Cycle {view.cycle}</span>
      <span className="spacer" />
      <button disabled={!canReady} onClick={onReady}>
        {you.ready ? "Waiting for others…" : "End cycle"}
      </button>
      <button onClick={onLeave}>Leave</button>
    </header>
  );
}
