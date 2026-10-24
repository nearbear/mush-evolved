// The Command terminal's steering (owner, 2026-10-22): the heading and whether the ship is in orbit, then, for the
// Commander, turn left or right, and travel as far as the fuel loaded in the combustion chamber (or leave orbit). Every button comes from view.actions.

import type { Action, EquipmentView, PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import "./terminal.css";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function ShipNavigation({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const { heading, orbiting } = view.navigation;
  const here = view.actions.filter(({ action: a }) => "equipment" in a && a.equipment === terminal.id);
  const turns = here.filter(({ action: a }) => a.type === "turn_ship");
  const travel = here.find(({ action: a }) => a.type === "travel");
  const leave = here.find(({ action: a }) => a.type === "leave_orbit");
  if (heading === null) return null;
  return (
    <section className="ship-navigation" aria-label={t("navigation.title")}>
      <h3>{t("navigation.title")}</h3>
      <p>
        <strong>{t("navigation.heading", { direction: t(`astro.directions.${heading}`) })}</strong>
        {orbiting && <> · {t("navigation.inOrbit")}</>}
      </p>
      <p>{t("navigation.fuel", { fuel: view.ship.combustion, max: view.ship.max.combustion })}</p>
      {turns.length > 0 && (
        <div className="ship-navigation-row">
          {turns.map((option) => (
            <ActionButton key={option.action.type === "turn_ship" ? option.action.side : ""} view={view} option={option} onAction={onAction}>
              <ActionLabel
                text={t(option.action.type === "turn_ship" && option.action.side === "left" ? "navigation.left" : "navigation.right")}
                cost={option.cost}
                chance={option.chance}
              />
            </ActionButton>
          ))}
        </div>
      )}
      {travel && (
        <div className="ship-navigation-row">
          <ActionButton view={view} option={travel} onAction={onAction}>
            <ActionLabel text={t("navigation.travel")} cost={travel.cost} chance={travel.chance} />
          </ActionButton>
        </div>
      )}
      {leave && (
        <div className="ship-navigation-row">
          <ActionButton view={view} option={leave} onAction={onAction}>
            <ActionLabel text={t("navigation.leaveOrbit")} cost={leave.cost} chance={leave.chance} />
          </ActionButton>
        </div>
      )}
      {(travel || leave) && <p className="ship-navigation-warning">{t("navigation.warning")}</p>}
    </section>
  );
}
