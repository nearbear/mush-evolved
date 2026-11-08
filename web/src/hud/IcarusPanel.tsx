// What the room view shows while you are away on an expedition (docs/plans/expedition.md, phase 2; owner, 2026-11-07):
// the Icarus is a room with no doors, drawn as a plain panel like a patrol ship's cockpit (PatrolCockpit.tsx). It names
// the planet, counts down to the return, opens the report (members see each event as it happens), and lists who is
// aboard so you can select them (a bandage, say); the floor's items are in the inventory panel as in any room.

import type { PlayerView, Target } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { ExpeditionReportDialog } from "./ExpeditionReportDialog.tsx";
import { sameTarget } from "./targets.ts";
import { useCountdown } from "./useCountdown.ts";

interface Props {
  view: PlayerView;
  expedition: NonNullable<PlayerView["expedition"]>;
  clockOffset: number;
  selected: Target;
  onSelect: (target: Target) => void;
  /** Absent in a read-only view (a replay). */
  onShareReport?: ((report: string, text: string) => void) | undefined;
}

export function IcarusPanel({ view, expedition, clockOffset, selected, onSelect, onShareReport }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  const time = useCountdown(expedition.returnAt, clockOffset);
  const [reading, setReading] = useState(false);
  const report = view.expeditions.find((r) => r.id === expedition.report);
  const aboard = view.players.filter((p) => p.alive && p.room === view.you.room);
  return (
    <section className="iso-room patrol-cockpit" aria-label={names.room(view.you.room)}>
      <h2>{t("expedition.aboard", { planet: expedition.planet })}</h2>
      <p>{t("expedition.back", { time })}</p>
      <button type="button" className="big" disabled={!report} onClick={() => setReading(true)}>
        {t("expedition.read")}
      </button>
      {aboard.map((p) => {
        const target: Target = { kind: "player", id: p.id };
        return (
          <button key={p.id} type="button" aria-pressed={sameTarget(selected, target)} onClick={() => onSelect(target)}>
            {names.characterGiven(p.character)}
          </button>
        );
      })}
      <ExpeditionReportDialog report={reading ? report : undefined} onClose={() => setReading(false)} canShare={view.canShareReports} onShare={onShareReport} />
    </section>
  );
}
