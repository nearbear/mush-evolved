// An expedition's report (owner, 2026-10-31, docs/plans/expedition.md): what happened in each sector, from the
// member's own view (`view.expeditions`). Opened from the member's private "back from the expedition" line in the
// Icarus Bay's room log, from the Icarus while away (IcarusPanel.tsx), where it grows as each step happens (phase 2),
// or from the Expeditions feature's list of your reports (SharedReports.tsx).
// Renders the report only; the rules wrote everything in it. A living member with an iTrackie may share it from here
// to the Expeditions feature (owner, 2026-11-07, #356) as editable text; sharing again appends to its entry's thread.

import { Dialog } from "@base-ui/react/dialog";
import { MAX_SHARED_PLANET_LENGTH, type ExpeditionEvent, type ExpeditionReportView } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { DialogHeader } from "./DialogHeader.tsx";
import "./settings.css";

export function ExpeditionReportDialog({
  report,
  onClose,
  canShare = false,
  onShare,
}: {
  report: ExpeditionReportView | undefined;
  onClose: () => void;
  /** Whether you may share it now (`view.canShareReports`); the Share button shows only then, and only with `onShare`. */
  canShare?: boolean;
  /** Absent in a read-only view (a replay). */
  onShare?: ((report: string, text: string) => void) | undefined;
}) {
  return (
    <Dialog.Root open={report !== undefined} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup expedition-report">
          {/* The popup unmounts when closed, so each opening starts on the report, not the share form. */}
          {report && <ReportBody report={report} share={canShare && onShare ? (text) => onShare(report.id, text) : undefined} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ReportBody({ report, share }: { report: ExpeditionReportView; share: ((text: string) => void) | undefined }) {
  const { t, i18n } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const [posted, setPosted] = useState(false);
  const toText = useReportText();
  return (
    <>
      <DialogHeader heading={t("expedition.title", { planet: report.planet })} closeLabel={t("expedition.close")} />
      {sharing && share ? (
        <ShareForm
          initial={toText(report)}
          again={report.shared !== undefined}
          onPost={(text) => {
            share(text);
            setSharing(false);
            setPosted(true);
          }}
        />
      ) : (
        <>
          <Crew report={report} language={i18n.language} />
          <ol className="expedition-events">
            {report.events.map((event, i) => (
              <Event key={i} event={event} />
            ))}
          </ol>
          {report.events.some((e) => (e.item !== undefined && e.kind !== "lostItem" && (e.amount ?? 0) > 0) || (e.found?.length ?? 0) > 0) && <p className="sub">{t(report.away ? "expedition.lootAboard" : "expedition.lootOnFloor")}</p>}
          {report.away && <p className="sub">{t("expedition.underWay")}</p>}
          {posted && <p className="sub" role="status">{t("expedition.shared")}</p>}
          {share && (
            <button type="button" className="expedition-share" onClick={() => setSharing(true)}>
              {t(report.shared ? "expedition.shareAgain" : "expedition.share")}
            </button>
          )}
        </>
      )}
    </>
  );
}

/**
 * The share form (owner, 2026-11-07): the report as text, which you may change in any way (lies included) before
 * posting it to the Expeditions feature. The text is never parsed; the server only moderates it and checks its length.
 */
function ShareForm({ initial, again, onPost }: { initial: string; again: boolean; onPost: (text: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => initial.slice(0, MAX_SHARED_PLANET_LENGTH));
  return (
    <form
      className="share-planet-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onPost(text);
      }}
    >
      <p className="sub">{t(again ? "expedition.shareAgainHint" : "expedition.shareHint")}</p>
      <label className="share-planet-text">
        <span>{t("expedition.shareLabel")}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_SHARED_PLANET_LENGTH} rows={8} />
      </label>
      <span className="sub share-planet-count" aria-hidden="true">
        {text.length}/{MAX_SHARED_PLANET_LENGTH}
      </span>
      <button type="submit" disabled={!text.trim()}>
        {t("expedition.sharePost")}
      </button>
    </form>
  );
}

/** The report as plain text, one line per event: what the share form starts from. */
function useReportText(): (report: ExpeditionReportView) => string {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const lines = useEventLines();
  return (report) => {
    const crew = new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(report.crew.map((c) => names.characterGiven(c)));
    return [
      t("expedition.title", { planet: report.planet }),
      t("expedition.crew", { names: crew }),
      ...report.events.map((event) => {
        const { sector, lines: said } = lines(event);
        return `${sector}: ${said.join(" ")}`;
      }),
    ].join("\n");
  };
}

function Crew({ report, language }: { report: ExpeditionReportView; language: string }) {
  const { t } = useTranslation();
  const names = useNames();
  const list = new Intl.ListFormat(language, { type: "conjunction" }).format(report.crew.map((c) => names.characterGiven(c)));
  return <p className="sub">{t("expedition.crew", { names: list })}</p>;
}

/** An event's sector name and its lines, as the report shows them. */
function useEventLines(): (event: ExpeditionEvent) => { sector: string; lines: string[] } {
  const { t } = useTranslation();
  const names = useNames();
  return (event) => {
    const sector = event.sector === "LANDING" ? t("expedition.landing") : t(`astro.tags.${event.sector}` as never, { defaultValue: event.sector });
    const count = event.amount ?? 0;
    const lines: string[] = [];
    switch (event.kind) {
      case "fight":
        if (event.fight) {
          // Phase 1's reports name no creature.
          const creature = t(`expedition.creatures.${event.creature ?? "unknown"}` as never, { defaultValue: t("expedition.creatures.unknown") });
          const params = { creature, enemy: count, strength: event.fight.strength };
          lines.push(event.fight.won ? t("expedition.events.fightWon", params) : t("expedition.events.fightLost", params));
          if (event.fight.grenades > 0) lines.push(t("expedition.events.grenades", { count: event.fight.grenades }));
          for (const f of event.found ?? []) lines.push(t("expedition.events.found", { count: f.count, item: names.item(f.item) }));
        }
        break;
      case "oxygen":
      case "fuel":
        lines.push(t(`expedition.events.${event.kind}`, { count }));
        break;
      case "harvest":
      case "provision":
      case "artifact":
      case "starmap":
        lines.push(t("expedition.events.found", { count, item: names.item(event.item ?? "") }));
        break;
      case "lostItem":
        lines.push(t("expedition.events.lostItem", { item: names.item(event.item ?? "") }));
        break;
      // Not built yet: the rules record it as Nothing (#214).
      case "disease":
        lines.push(t("expedition.events.nothing"));
        break;
      case "lost":
      case "found":
      case "foundDead":
        lines.push(t(`expedition.events.${event.kind}`, { name: event.who ? names.characterGiven(event.who) : "" }));
        break;
      default:
        lines.push(t(`expedition.events.${event.kind}`));
    }
    for (const h of event.hurt ?? []) if (h.hp > 0) lines.push(t("expedition.events.hurt", { name: names.characterGiven(h.name), count: h.hp }));
    for (const name of event.died ?? []) lines.push(t("expedition.events.died", { name: names.characterGiven(name) }));
    return { sector, lines };
  };
}

function Event({ event }: { event: ExpeditionEvent }) {
  const { sector, lines } = useEventLines()(event);
  return (
    <li>
      <strong>{sector}</strong>
      {lines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </li>
  );
}
