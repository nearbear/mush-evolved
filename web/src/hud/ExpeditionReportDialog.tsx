// An expedition's report (owner, 2026-10-31, docs/plans/expedition.md): what happened in each sector, from the
// member's own view (`view.expeditions`). Opened from the member's private "back from the expedition" line in the
// Icarus Bay's room log, or from the Icarus while away (IcarusPanel.tsx), where it grows as each step happens (phase 2).
// Renders the report only; the rules wrote everything in it.

import { Dialog } from "@base-ui/react/dialog";
import type { ExpeditionEvent, ExpeditionReportView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { DialogHeader } from "./DialogHeader.tsx";
import "./settings.css";

export function ExpeditionReportDialog({ report, onClose }: { report: ExpeditionReportView | undefined; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <Dialog.Root open={report !== undefined} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup expedition-report">
          {report && (
            <>
              <DialogHeader heading={t("expedition.title", { planet: report.planet })} closeLabel={t("expedition.close")} />
              <Crew report={report} language={i18n.language} />
              <ol className="expedition-events">
                {report.events.map((event, i) => (
                  <Event key={i} event={event} />
                ))}
              </ol>
              {report.events.some((e) => e.item !== undefined && (e.amount ?? 0) > 0) && <p className="sub">{t(report.away ? "expedition.lootAboard" : "expedition.lootOnFloor")}</p>}
              {report.away && <p className="sub">{t("expedition.underWay")}</p>}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Crew({ report, language }: { report: ExpeditionReportView; language: string }) {
  const { t } = useTranslation();
  const names = useNames();
  const list = new Intl.ListFormat(language, { type: "conjunction" }).format(report.crew.map((c) => names.characterGiven(c)));
  return <p className="sub">{t("expedition.crew", { names: list })}</p>;
}

function Event({ event }: { event: ExpeditionEvent }) {
  const { t } = useTranslation();
  const names = useNames();
  const sector = event.sector === "LANDING" ? t("expedition.landing") : t(`astro.tags.${event.sector}` as never, { defaultValue: event.sector });
  const count = event.amount ?? 0;
  const lines: string[] = [];
  switch (event.kind) {
    case "fight":
      if (event.fight) {
        const params = { enemy: count, strength: event.fight.strength };
        lines.push(event.fight.won ? t("expedition.events.fightWon", params) : t("expedition.events.fightLost", params));
        if (event.fight.grenades > 0) lines.push(t("expedition.events.grenades", { count: event.fight.grenades }));
      }
      break;
    case "oxygen":
    case "fuel":
      lines.push(t(`expedition.events.${event.kind}`, { count }));
      break;
    case "harvest":
    case "provision":
    case "artifact":
      lines.push(t("expedition.events.found", { count, item: names.item(event.item ?? "") }));
      break;
    default:
      lines.push(t(`expedition.events.${event.kind}`));
  }
  for (const h of event.hurt ?? []) if (h.hp > 0) lines.push(t("expedition.events.hurt", { name: names.characterGiven(h.name), count: h.hp }));
  for (const name of event.died ?? []) lines.push(t("expedition.events.died", { name: names.characterGiven(name) }));
  return (
    <li>
      <strong>{sector}</strong>
      {lines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </li>
  );
}
