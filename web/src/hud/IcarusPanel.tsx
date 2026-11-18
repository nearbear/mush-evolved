// What the room view shows while you are away on an expedition (docs/plans/expedition.md, phase 2; owner, 2026-11-07):
// the Icarus is a room with no doors, drawn as a plain panel like a patrol ship's cockpit (PatrolCockpit.tsx). It names
// the planet, counts down to the return, opens the report (members see each event as it happens), and lists who is
// aboard so you can select them (a bandage, say); the floor's items are in the inventory panel as in any room.
// Docked (owner, 2026-11-17), it is the room you board before a takeoff: no countdown or report, just the buttons to leave
// or launch. A stopgap to keep it playable; the owner is redoing this UI.

import type { Action, PlayerView, Target } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ExpeditionReportDialog } from "./ExpeditionReportDialog.tsx";
import { sameTarget } from "./targets.ts";
import { useCountdown } from "./useCountdown.ts";

interface Props {
  view: PlayerView;
  /** Null while docked: you boarded and nobody has taken off yet. */
  expedition: NonNullable<PlayerView["expedition"]> | null;
  selected: Target;
  onSelect: (target: Target) => void;
  onAction: (action: Action) => void;
  /** Absent in a read-only view (a replay). */
  onShareReport?: ((report: string, text: string) => void) | undefined;
}

export function IcarusPanel({ view, expedition, selected, onSelect, onAction, onShareReport }: Props) {
  const names = useNames();
  const aboard = view.players.filter((p) => p.alive && p.room === view.you.room);
  return (
    <section className="iso-room patrol-cockpit" aria-label={names.room(view.you.room)}>
      {expedition ? <Away view={view} expedition={expedition} onShareReport={onShareReport} /> : <Docked view={view} onAction={onAction} />}
      {aboard.map((p) => {
        const target: Target = { kind: "player", id: p.id };
        return (
          <button key={p.id} type="button" aria-pressed={sameTarget(selected, target)} onClick={() => onSelect(target)}>
            {names.characterGiven(p.character)}
          </button>
        );
      })}
    </section>
  );
}

function Away({ view, expedition, onShareReport }: { view: PlayerView; expedition: NonNullable<PlayerView["expedition"]>; onShareReport: Props["onShareReport"] }) {
  const { t } = useTranslation();
  const names = useNames();
  const time = useCountdown(expedition.returnAt);
  const [reading, setReading] = useState(false);
  const report = view.expeditions.find((r) => r.id === expedition.report);
  return (
    <>
      <h2>{expedition.ship !== undefined ? t("expedition.aboardShip", { ship: names.room(expedition.ship), planet: expedition.planet }) : t("expedition.aboard", { planet: expedition.planet })}</h2>
      <p>{t("expedition.back", { time })}</p>
      <button type="button" className="big" disabled={!report} onClick={() => setReading(true)}>
        {t("expedition.read")}
      </button>
      <ExpeditionReportDialog report={reading ? report : undefined} onClose={() => setReading(false)} canShare={view.canShareReports} onShare={onShareReport} />
    </>
  );
}

/** Leave or launch, whichever `view.actions` offers (the server decides; refused ones show why). */
function Docked({ view, onAction }: { view: PlayerView; onAction: (action: Action) => void }) {
  const names = useNames();
  const options = (["icarus_takeoff", "leave_icarus"] as const).flatMap((type) => view.actions.filter((o) => o.action.type === type));
  return (
    <>
      <h2>{names.room(view.you.room)}</h2>
      {options.map((o) => (
        <ActionButton key={o.action.type} view={view} option={o} onAction={onAction} className="big">
          {names.action(o.action.type)}
        </ActionButton>
      ))}
    </>
  );
}
