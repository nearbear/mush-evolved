// Pinned greenhouse plant status card shown above the Botany feature thread (owner, 2026-11-21).
// Displays the latest snapshot shared from the Hydroponics center (`view.sharedPlants`), with the same
// vertical list layout: (icon + name stacked) -> effects stacked -> statuses stacked.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerView, SharedPlantStatus } from "@mush2/shared";
import { itemIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { PlantStatusLines } from "./PlantTerminal.tsx";

export function SharedPlantsCard({ shared, view }: { shared: SharedPlantStatus; view: PlayerView }) {
  const { t } = useTranslation();
  const names = useNames();
  const [open, setOpen] = useState(true);
  const author = (id: string) =>
    names.character((id === view.you.id ? view.you : view.players.find((p) => p.id === id))?.character ?? id);
  const byLine = t("itrackie.sharedPlanets.by", {
    name: author(shared.by),
    day: shared.day,
    cycle: shared.cycleOfDay,
  });

  return (
    <section className="shared-plants-card" aria-label={t("itrackie.sharedPlants.title")}>
      <div className="shared-plants-card-head">
        <div>
          <strong className="shared-plants-card-title">{t("itrackie.sharedPlants.title")}</strong>
          <p className="sub">{byLine}</p>
        </div>
        <button
          type="button"
          className="shared-plants-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("itrackie.sharedPlants.hide") : t("itrackie.sharedPlants.show")}
        </button>
      </div>
      {open && (
        <div className="shared-plants-card-body">
          {shared.plants.length === 0 ? (
            <p className="sub">{t("botanyTerminal.empty")}</p>
          ) : (
            <ul className="plant-status-list plant-status-list-compact" aria-label={t("botanyTerminal.listLabel")}>
              {shared.plants.map((row, i) => {
                const icon = itemIcon(row.species);
                const effectLines = row.effects
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean);
                return (
                  <li key={`${row.species}-${i}`} className="plant-status-row">
                    <div className="plant-status-head">
                      {icon && <img className="plant-status-icon" src={icon} alt="" />}
                      <strong className="plant-status-name">{names.item(row.species)}</strong>
                    </div>
                    <div className="plant-status-col">
                      {effectLines.length > 0 ? (
                        <ul className="plant-status-effects">
                          {effectLines.map((line, j) => (
                            <li key={j}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="plant-status-unknown">{t("botanyTerminal.effectsUnknown")}</p>
                      )}
                    </div>
                    <div className="plant-status-col">
                      <PlantStatusLines thirst={row.thirst} sickCycles={row.sickCycles} young={row.young} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {shared.text && <p className="shared-plants-note">{shared.text}</p>}
        </div>
      )}
    </section>
  );
}
