// What the room view shows aboard the Icarus (docs/plans/expedition.md, phase 2; owner, 2026-11-07): a room with no
// doors, drawn as a plain panel. Owner, 2026-11-17: docked, the middle shows the seats as podiums (the character
// picker's, Podium.tsx), one per place the Icarus holds (`view.icarusSeats`: 4, or 6 with the larger bay), with whoever
// is aboard standing on theirs; pressing one selects them (a bandage, say). Away (owner, 2026-11-19), the expedition
// screen (ExpeditionTimeline.tsx) sits above them, the seats are one row that scrolls sideways without empty podiums
// (except for lost crew members, whose podium stays empty with their name and no HP), and each active member shows
// their heart icon and HP beside their name. Under them, a TechnoBox bar like the patrol cockpit's (PatrolCockpit.tsx):
// docked, Launch expedition and Leave the Icarus; away, the planet and the report (the return timer is in the top bar).
// The panel has the room view to itself: no ID card, minimap or mobile peek bar over it, the iso view's star field and
// orbited planet behind, and the seats resting on the bar. The floor's items are in the inventory panel as in any room.

import { actionVisibility, type Action, type CharacterId, type PlayerView, type Target } from "@mush2/shared";
import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { HP_ICON } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { ExpeditionReportDialog } from "./ExpeditionReportDialog.tsx";
import { ExpeditionTimeline } from "./ExpeditionTimeline.tsx";
import { Podium } from "./Podium.tsx";
import { spaceSky } from "./spaceSky.ts";
import { sameTarget } from "./targets.ts";
import { TechnoBox } from "./TechnoBox.tsx";

interface Props {
  view: PlayerView;
  /** Null while docked: you boarded and nobody has taken off yet. */
  expedition: NonNullable<PlayerView["expedition"]> | null;
  selected: Target;
  onSelect: (target: Target) => void;
  onAction: (action: Action) => void;
  /** The planet the ship orbits, as an image URL, or null: drawn at the bottom right as the iso view does. */
  planet: string | null;
  /** Leave the Icarus, while docked, as `view.actions` offers it. */
  leave?: PlayerView["actions"][number] | undefined;
  /** Absent in a read-only view (a replay). */
  onShareReport?: ((report: string, text: string) => void) | undefined;
}

export function IcarusPanel({ view, expedition, selected, onSelect, onAction, planet, leave, onShareReport }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  // Docked, the crew waits in the bay among everyone else there (#469): only the boarded are aboard.
  const boarded = new Set([...(view.you.boardedIcarus ? [view.you.id] : []), ...view.players.filter((p) => p.boarded).map((p) => p.id)]);
  const aboard = [view.you, ...view.players]
    .filter((p) => p.alive && p.room === view.you.room && (expedition !== null || boarded.has(p.id)))
    .sort((a, b) => a.id.localeCompare(b.id));
  // A patrol ship's landing has room for its pilot only; the Icarus has its seats, never fewer than who is aboard.
  const launch = expedition ? undefined : view.actions.find((o) => o.action.type === "icarus_takeoff");
  const seats = expedition?.ship !== undefined ? aboard.length : Math.max(view.icarusSeats, aboard.length);
  // Away, each member's HP beside their name (`expedition.hp`, to members still with the crew), your own from `you`.
  const crewHp = expedition?.hp;
  const hp = (p: (typeof aboard)[number]): number | undefined =>
    !expedition ? undefined : p.id === view.you.id ? view.you.hp : crewHp?.find((m) => m.name === p.character)?.hp;
  const aboardByChar = new Map(aboard.map((p) => [p.character, p]));
  const lostChars = new Set(view.lost.map((l) => l.name));
  // Away: no empty podiums for unfilled seats; only active crew members and lost crew members (empty podium + name).
  type AwaySeat = { kind: "aboard"; player: (typeof aboard)[number] } | { kind: "lost"; character: CharacterId };
  const awaySeats: AwaySeat[] | null = expedition
    ? expedition.crew.flatMap((c): AwaySeat[] => {
        const p = aboardByChar.get(c);
        if (p) return [{ kind: "aboard", player: p }];
        if (lostChars.has(c)) return [{ kind: "lost", character: c }];
        return [];
      })
    : null;
  const [sky] = useState(spaceSky);
  return (
    <section
      className="iso-room icarus-cabin"
      aria-label={names.room(view.you.room)}
      style={sky ? ({ "--sky": `url(${sky.sky})`, "--stars": `url(${sky.stars})` } as CSSProperties) : undefined}
    >
      {/* The iso view's backdrop (owner, 2026-11-20): the star field, and the orbited planet at the bottom right. */}
      <div className="icarus-sky" aria-hidden="true" />
      {planet && <img className="icarus-planet" src={planet} alt="" data-away={expedition ? true : undefined} />}
      {/* Away, the expedition screen sits above the seats (docs/plans/expedition-ui.md; owner, 2026-11-19). */}
      {expedition && <ExpeditionTimeline expedition={expedition} report={view.expeditions.find((r) => r.id === expedition.report)} />}
      <ul className="icarus-seats" data-away={expedition ? true : undefined} aria-label={t("expedition.seats")} style={{ "--seats": seats, "--half": Math.ceil(seats / 2) } as CSSProperties}>
        {awaySeats
          ? awaySeats.map((seat) => {
              if (seat.kind === "lost") {
                return (
                  <li key={`lost-${seat.character}`} className="icarus-seat icarus-seat-lost">
                    <Podium />
                    <span className="icarus-seat-label">
                      <span>{names.characterGiven(seat.character)}</span>
                    </span>
                  </li>
                );
              }
              const p = seat.player;
              const target: Target = { kind: "player", id: p.id };
              const memberHp = hp(p);
              return (
                <li key={p.id} className="icarus-seat">
                  <button type="button" className="pick-tile" aria-pressed={sameTarget(selected, target)} onClick={() => onSelect(target)}>
                    <Podium character={p.character} />
                    <span className="icarus-seat-label">
                      <span>{names.characterGiven(p.character)}</span>
                      {memberHp !== undefined && (
                        <span className="icarus-hp">
                          <img src={HP_ICON} alt="" />
                          <span aria-hidden="true">{memberHp}</span>
                          <span className="sr-only">{t("expedition.timeline.hp", { hp: memberHp })}</span>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })
          : Array.from({ length: seats }, (_, i) => {
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
                    <span className="icarus-seat-label">
                      <span>{names.characterGiven(p.character)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
      </ul>
      {/* Docked, the bar holds Launch expedition when you are offered it (someone who can't fly isn't), with Leave the
          Icarus under it. */}
      {(expedition || launch || leave) && (
        <TechnoBox className="space-bar icarus-bar">
          {expedition ? (
            <Away view={view} expedition={expedition} onShareReport={onShareReport} />
          ) : (
            <>
              {launch && <Launch view={view} option={launch} onAction={onAction} />}
              {leave && (
                <ActionButton view={view} option={leave} onAction={onAction} className="icarus-leave">
                  {names.action(leave.action.type)}
                </ActionButton>
              )}
            </>
          )}
        </TechnoBox>
      )}
    </section>
  );
}

function Away({ view, expedition, onShareReport }: { view: PlayerView; expedition: NonNullable<PlayerView["expedition"]>; onShareReport: Props["onShareReport"] }) {
  const { t } = useTranslation();
  const [reading, setReading] = useState(false);
  const report = view.expeditions.find((r) => r.id === expedition.report);
  return (
    <>
      <h2>{t("expedition.exploring", { planet: expedition.planet })}</h2>
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
