// What the room view shows while you are lost on a planet (docs/plans/expedition.md, phase 3, slice B; owner,
// 2026-11-08, #357): a place of your own with no doors, drawn as a plain panel like the Icarus's (IcarusPanel.tsx). It
// names the planet, says how you get back, and opens the report of the expedition you got lost on, which stops at
// that line, and shows its timeline up to there (ExpeditionTimeline.tsx, owner 2026-11-19). Your items are in the inventory panel as anywhere.

import type { PlayerView } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { ExpeditionReportDialog } from "./ExpeditionReportDialog.tsx";
import { characterOf, ExpeditionTimeline } from "./ExpeditionTimeline.tsx";

interface Props {
  view: PlayerView;
  /** Absent in a read-only view (a replay). */
  onShareReport?: ((report: string, text: string) => void) | undefined;
}

export function LostPanel({ view, onShareReport }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  const [reading, setReading] = useState(false);
  const planet = view.lost.find((l) => l.name === view.you.character)?.planet ?? "";
  // The latest report is the one you got lost on.
  const report = view.expeditions.at(-1);
  // While the crew is still there, what the Astrophysics feature holds about the planet, if you read it.
  const shared = view.sharedPlanets.find((e) => e.id === view.expedition?.shared);
  return (
    <section className="iso-room patrol-cockpit lost-panel" aria-label={names.room(view.you.room)}>
      <h2>{t("expedition.lost.heading", { planet })}</h2>
      <p>{t("expedition.lost.text")}</p>
      {report && <ExpeditionTimeline expedition={null} report={report} shared={shared} sharedBy={shared && names.character(characterOf(view, shared.by))} />}
      <button type="button" className="big" disabled={!report} onClick={() => setReading(true)}>
        {t("expedition.read")}
      </button>
      <ExpeditionReportDialog report={reading ? report : undefined} onClose={() => setReading(false)} canShare={view.canShareReports} onShare={onShareReport} />
    </section>
  );
}
