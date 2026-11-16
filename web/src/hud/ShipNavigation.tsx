// The Command terminal's steering (owner, 2026-10-22): the heading and whether the ship is in orbit, then, for the
// Commander, turn left or right, and travel as far as the fuel loaded in the combustion chamber (or leave orbit). Every button comes from view.actions.
// Travel and leave orbit always ask first, with one static warning about what a jump can cost (patrol ships in flight, an expedition out,
// a rebel signal being decoded), whatever the ship's state (owner, 2026-11-12). Cosmetic only: confirming always goes through.

import { PLANET_DIRECTIONS, type Action, type EquipmentView, type PlayerView } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { UnavailableButton } from "./CommandTerminal.tsx";
import { ConfirmPanel } from "./ConfirmPanel.tsx";
import { terminalLogin } from "./terminalUsername.ts";
import "./terminal.css";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function ShipNavigation({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const { heading, orbiting, traveling } = view.navigation;
  /** A jump always asks first. */
  const jump = (action: Action) => setConfirming(action);
  const here = view.actions.filter(({ action: a }) => "equipment" in a && a.equipment === terminal.id);
  const turnLeft = here.find(({ action: a }) => a.type === "turn_ship" && a.side === "left");
  const turnRight = here.find(({ action: a }) => a.type === "turn_ship" && a.side === "right");
  const travel = here.find(({ action: a }) => a.type === "travel");
  const leave = here.find(({ action: a }) => a.type === "leave_orbit");
  const commander = terminalLogin(terminal.type, view, terminal.id).access !== "limited";
  if (heading === null) return null;
  const jumpReason = !commander
    ? t("navigation.unavailableCommanderOnly")
    : traveling
      ? t("navigation.unavailableTraveling")
      : t("navigation.unavailable");
  return (
    <section className="ship-navigation" aria-label={t("navigation.title")}>
      <div className="ship-compass" role="img" aria-label={t("navigation.heading", { direction: t(`astro.directions.${heading}`) })}>
        {[2, 1, 0, -1, -2].map((offset) => {
          // PLANET_DIRECTIONS runs anticlockwise, so what lies to the left of the heading is the next one along.
          const direction = PLANET_DIRECTIONS[(PLANET_DIRECTIONS.indexOf(heading) + offset + 2 * PLANET_DIRECTIONS.length) % PLANET_DIRECTIONS.length] ?? heading;
          return (
            <span key={offset} className={offset === 0 ? "ship-compass-heading" : undefined} aria-hidden="true">
              {t(`astro.directions.${direction}`)}
            </span>
          );
        })}
      </div>
      {orbiting && <p>{t("navigation.inOrbit")}</p>}
      {traveling && <p>{t("navigation.traveling")}</p>}
      <div className="ship-navigation-row ship-navigation-turns">
        {turnLeft ? (
          <ActionButton view={view} option={turnLeft} onAction={onAction}>
            <ActionLabel text={t("navigation.left")} cost={turnLeft.cost} chance={turnLeft.chance} />
          </ActionButton>
        ) : (
          <UnavailableButton big={false} reason={jumpReason} ap={view.config.turnAp}>
            {t("navigation.left")}
          </UnavailableButton>
        )}
        {turnRight ? (
          <ActionButton view={view} option={turnRight} onAction={onAction}>
            <ActionLabel text={t("navigation.right")} cost={turnRight.cost} chance={turnRight.chance} />
          </ActionButton>
        ) : (
          <UnavailableButton big={false} reason={jumpReason} ap={view.config.turnAp}>
            {t("navigation.right")}
          </UnavailableButton>
        )}
      </div>
      {!orbiting && (
        <div className="ship-navigation-row">
          {travel ? (
            <ActionButton className="big" view={view} option={travel} onAction={jump}>
              <ActionLabel text={t("navigation.travel")} cost={travel.cost} chance={travel.chance} />
            </ActionButton>
          ) : (
            <UnavailableButton reason={jumpReason} ap={view.config.travelAp}>
              {t("navigation.travel")}
            </UnavailableButton>
          )}
        </div>
      )}
      {orbiting && (
        <div className="ship-navigation-row">
          {leave ? (
            <ActionButton className="big" view={view} option={leave} onAction={jump}>
              <ActionLabel text={t("navigation.leaveOrbit")} cost={leave.cost} chance={leave.chance} />
            </ActionButton>
          ) : (
            <UnavailableButton reason={jumpReason} ap={view.config.leaveOrbitAp}>
              {t("navigation.leaveOrbit")}
            </UnavailableButton>
          )}
        </div>
      )}
      {(travel || leave) && <p className="ship-navigation-warning">{t("navigation.warning")}</p>}
      <ConfirmPanel
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        message={t("navigation.jumpConfirm")}
        yesLabel={confirming?.type === "leave_orbit" ? t("navigation.leaveOrbit") : t("navigation.travel")}
        backLabel={t("navigation.jumpBack")}
        onYes={() => {
          if (confirming) onAction(confirming);
          setConfirming(null);
        }}
      />
    </section>
  );
}
