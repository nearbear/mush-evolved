// What the room view shows aboard the Icarus (docs/plans/expedition.md, phase 2; owner, 2026-11-07): a room with no
// doors, drawn as a plain panel. Owner, 2026-11-17: the middle shows the seats as podiums (the character picker's,
// Podium.tsx), one per place the Icarus holds (`view.icarusSeats`: 4, or 6 with the larger bay), with whoever is aboard
// standing on theirs; pressing one selects them (a bandage, say). Away (owner, 2026-11-19), the expedition screen
// (ExpeditionTimeline.tsx) sits above them, the seats are one row that scrolls sideways, and each shows its HP. Under them, a TechnoBox bar like the patrol cockpit's
// (PatrolCockpit.tsx): docked, the Launch expedition button where Shoot would be; away, the planet, the countdown to the
// return and the report (members see each event as it happens). Leave the Icarus is a small button under the minimap
// (GameView). A patrol ship's landing shows its own crew only, one podium. The floor's items are in the inventory
// panel as in any room.

import { actionVisibility, type Action, type PlayerView, type Target } from "@mush2/shared";
import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { ExpeditionReportDialog } from "./ExpeditionReportDialog.tsx";
import { expeditionExtras } from "./expeditionStub.ts";
import { ExpeditionTimeline } from "./ExpeditionTimeline.tsx";
import { Podium } from "./Podium.tsx";
import { sameTarget } from "./targets.ts";
import { TechnoBox } from "./TechnoBox.tsx";
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
  const { t } = useTranslation();
  const names = useNames();
  const aboard = [view.you, ...view.players].filter((p) => p.alive && p.room === view.you.room).sort((a, b) => a.id.localeCompare(b.id));
  // A patrol ship's landing has room for its pilot only; the Icarus has its seats, never fewer than who is aboard.
  const launch = expedition ? undefined : view.actions.find((o) => o.action.type === "icarus_takeoff");
  const seats = expedition?.ship !== undefined ? aboard.length : Math.max(view.icarusSeats, aboard.length);
  // Away, each member's HP under their name: everyone's once the view sends it (expeditionStub.ts), else your own.
  const crewHp = expedition ? expeditionExtras(expedition).hp : undefined;
  const hp = (p: (typeof aboard)[number]): number | undefined =>
    !expedition ? undefined : p.id === view.you.id ? view.you.hp : crewHp?.find((m) => m.name === p.character)?.hp;
  return (
    <section className="iso-room icarus-cabin" aria-label={names.room(view.you.room)}>
      {/* Away, the expedition screen sits above the seats (docs/plans/expedition-ui.md; owner, 2026-11-19). */}
      {expedition && <ExpeditionTimeline expedition={expedition} report={view.expeditions.find((r) => r.id === expedition.report)} />}
      <ul className="icarus-seats" data-away={expedition ? true : undefined} aria-label={t("expedition.seats")} style={{ "--seats": seats, "--half": Math.ceil(seats / 2) } as CSSProperties}>
        {Array.from({ length: seats }, (_, i) => {
          const p = aboard[i];
          if (!p) {
            return (
              <li key={`empty-${i}`} className="icarus-seat">
                <Podium />
                <span className="sr-only">{t("expedition.emptySeat")}</span>
              </li>
            );
          }
          const target: Target = { kind: "player", id: p.id };
          return (
            <li key={p.id} className="icarus-seat">
              <button type="button" className="pick-tile" aria-pressed={sameTarget(selected, target)} onClick={() => onSelect(target)}>
                <Podium character={p.character} />
                <span>{names.characterGiven(p.character)}</span>
                {hp(p) !== undefined && <span className="icarus-hp">{t("expedition.timeline.hp", { hp: hp(p) })}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {/* Docked, the bar is there only when you are offered the launch (someone who can't fly isn't). */}
      {(expedition || launch) && (
        <TechnoBox className="space-bar icarus-bar">
          {expedition ? <Away view={view} expedition={expedition} onShareReport={onShareReport} /> : launch && <Launch view={view} option={launch} onAction={onAction} />}
        </TechnoBox>
      )}
    </section>
  );
}

function Away({ view, expedition, onShareReport }: { view: PlayerView; expedition: NonNullable<PlayerView["expedition"]>; onShareReport: Props["onShareReport"] }) {
  const { t } = useTranslation();
  const time = useCountdown(expedition.returnAt);
  const [reading, setReading] = useState(false);
  const report = view.expeditions.find((r) => r.id === expedition.report);
  return (
    <>
      <h2>{t("expedition.exploring", { planet: expedition.planet })}</h2>
      <p>{t("expedition.back", { time })}</p>
      <button type="button" className="big icarus-main" disabled={!report} onClick={() => setReading(true)}>
        {t("expedition.read")}
      </button>
      <ExpeditionReportDialog report={reading ? report : undefined} onClose={() => setReading(false)} canShare={view.canShareReports} onShare={onShareReport} />
    </>
  );
}

/** Launch expedition, as `view.actions` offers it (the server decides; a refused one shows why). */
function Launch({ view, option, onAction }: { view: PlayerView; option: PlayerView["actions"][number]; onAction: (action: Action) => void }) {
  const names = useNames();
  return (
    <ActionButton view={view} option={option} onAction={onAction} className="big icarus-main">
      <ActionLabel text={names.action(option.action.type)} cost={option.cost} chance={option.chance} visibility={actionVisibility(option.action.type, view)} />
    </ActionButton>
  );
}
