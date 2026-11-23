// Pinned Hydroponics card shown above the Botany feature thread (owner, 2026-11-21): the latest snapshot shared from
// the Hydroponics center (`view.sharedPlants`), each plant a `PlantStatusRow` as in the terminal (owner, 2026-11-22),
// in a `TerminalCollapsible` like every other collapsible, with who shared it (given name) and when as a caption in its
// header. The effects are the sharer's free text, so each line is sorted by its shape: "+N <resource>" lines become
// amounts, a temporary effect exactly as the share form prefills it becomes its name with a popover, the rest bulleted
// notes (cures, ailment odds).

import { useTranslation } from "react-i18next";
import type { PlayerView, SharedPlantStatus } from "@mush2/shared";
import type { TFunction } from "i18next";
import { useNames } from "../i18n/names.ts";
import { FRUIT_BUFF_IDS, fruitBuffNote, PlantStatusRow, type PlantNote, type ResourceLine } from "./PlantStatusRow.tsx";
import { RESOURCE_STATS, type StatDelta } from "./StatAmount.tsx";
import { TerminalCollapsible } from "./TerminalCollapsible.tsx";

/** Splits the shared effects text into resource lines ("+1 AP") and everything else (cures, ailment odds). */
function splitEffects(effects: string, t: TFunction): { resources: ResourceLine[]; notes: PlantNote[] } {
  const stats = new Map<string, StatDelta["stat"]>(RESOURCE_STATS.map((stat) => [t(`stat.${stat}`).toLowerCase(), stat]));
  stats.set(t("itemAttr.satiety").toLowerCase(), "satiety");
  const buffs = new Map(FRUIT_BUFF_IDS.map((buff) => [t(`inspect.fruitBuffs.${buff}`), buff]));
  const resources: ResourceLine[] = [];
  const notes: PlantNote[] = [];
  for (const raw of effects.split("\n")) {
    const text = raw.trim();
    if (!text) continue;
    const match = /^([+\-−])\s*(\d+)\s+(.+)$/.exec(text);
    if (!match) {
      const buff = buffs.get(text);
      notes.push(buff ? fruitBuffNote(buff, t) : { text });
      continue;
    }
    const stat = stats.get(match[3]!.trim().toLowerCase());
    const amount = Number(match[2]) * (match[1] === "+" ? 1 : -1);
    resources.push(stat && amount !== 0 ? { stat, amount } : { text });
  }
  return { resources, notes };
}

export function SharedPlantsCard({ shared, view }: { shared: SharedPlantStatus; view: PlayerView }) {
  const { t } = useTranslation();
  const names = useNames();
  const author = (id: string) =>
    names.characterGiven((id === view.you.id ? view.you : view.players.find((p) => p.id === id))?.character ?? id);
  const byLine = t("itrackie.sharedPlanets.by", {
    name: author(shared.by),
    day: shared.day,
    cycle: shared.cycleOfDay,
  });

  return (
    <section className="shared-plants" aria-label={t("itrackie.sharedPlants.title")}>
      <TerminalCollapsible
        heading={
          <>
            {t("itrackie.sharedPlants.title")} <span className="sub shared-plants-by">{byLine}</span>
          </>
        }
        defaultOpen
      >
        {shared.plants.length === 0 ? (
          <p className="sub">{t("botanyTerminal.empty")}</p>
        ) : (
          <ul className="plant-status-list shared-plants-list" aria-label={t("botanyTerminal.listLabel")}>
            {shared.plants.map((row, i) => {
              const { resources, notes } = splitEffects(row.effects, t);
              return (
                <PlantStatusRow
                  key={`${row.species}-${i}`}
                  species={row.species}
                  thirst={row.thirst}
                  sickCycles={row.sickCycles}
                  young={row.young}
                  resources={resources}
                  notes={notes}
                  unknown={resources.length === 0 && notes.length === 0 ? t("botanyTerminal.effectsUnknown") : undefined}
                />
              );
            })}
          </ul>
        )}
        {shared.text && <p className="shared-plants-note">{shared.text}</p>}
      </TerminalCollapsible>
    </section>
  );
}
