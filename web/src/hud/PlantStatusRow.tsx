// One plant in the Hydroponics center terminal and in the Botany feature's pinned Hydroponics card (owner,
// 2026-11-22): the name on its own line; the plant's icon with its status and the resources its fruit gives beside it;
// then the cures and ailment odds as a bulleted caption under the icon. Rows sit in a list with dividers between them.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { itemIcon, PLANT_ICONS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { StatAmount, type StatDelta } from "./StatAmount.tsx";

/** A resource line: a known resource as a `StatDelta`, or free text the sharer wrote ("+1 Spores"). */
export type ResourceLine = StatDelta | { text: string };

export interface PlantNote {
  text: string;
  /** Drawn in the danger colour (the Mush fruit-lore warning). */
  danger?: boolean;
}

export function PlantStatusRow({
  species,
  thirst,
  sickCycles,
  young,
  resources,
  notes,
  unknown,
}: {
  species: string;
  thirst: 0 | 1 | 2;
  sickCycles: number | null;
  young: boolean;
  resources: readonly ResourceLine[];
  notes: readonly PlantNote[];
  /** Shown in place of resources and notes when the viewer doesn't know what the fruit does. */
  unknown?: ReactNode;
}) {
  const names = useNames();
  const icon = itemIcon(species);
  return (
    <li className="plant-row">
      <strong className="plant-row-name">{names.item(species)}</strong>
      {icon && <img className="plant-row-icon" src={icon} alt="" />}
      <div className="plant-row-side">
        <PlantStatusLines thirst={thirst} sickCycles={sickCycles} young={young} />
        {unknown ? (
          <p className="plant-status-unknown">{unknown}</p>
        ) : (
          resources.length > 0 && (
            <ul className="stat-amounts stat-amounts-row">
              {resources.map((line, j) => (
                <li key={j}>{"stat" in line ? <StatAmount stat={line.stat} amount={line.amount} /> : <span>{line.text}</span>}</li>
              ))}
            </ul>
          )
        )}
      </div>
      {!unknown && notes.length > 0 && (
        <ul className="plant-row-notes">
          {notes.map((note, j) => (
            <li key={j} className={note.danger ? "plant-row-danger" : undefined}>
              {note.text}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** A plant's statuses, side by side. */
export function PlantStatusLines({ thirst, sickCycles, young }: { thirst: 0 | 1 | 2; sickCycles: number | null; young: boolean }) {
  const { t } = useTranslation();
  const needsAttention = thirst > 0 || sickCycles !== null;
  return (
    <ul className="plant-status-states">
      {sickCycles !== null && (
        <li className="plant-status-state plant-status-sick">
          <img src={PLANT_ICONS.sick} alt="" />
          <span>{t("botanyTerminal.diseasedFor", { count: sickCycles })}</span>
        </li>
      )}
      {thirst === 1 && (
        <li className="plant-status-state plant-status-thirsty">
          <img src={PLANT_ICONS.thirsty} alt="" />
          <span>{t("itemAttr.thirsty")}</span>
        </li>
      )}
      {thirst === 2 && (
        <li className="plant-status-state plant-status-dried">
          <img src={PLANT_ICONS.dried} alt="" />
          <span>{t("botanyTerminal.driedOut")}</span>
        </li>
      )}
      {!needsAttention && <li className="plant-status-state plant-status-healthy">{t("botanyTerminal.healthy")}</li>}
      {young && (
        <li className="plant-status-state plant-status-young">
          <img src={PLANT_ICONS.young} alt="" />
          <span>{t("itemAttr.young")}</span>
        </li>
      )}
    </ul>
  );
}

