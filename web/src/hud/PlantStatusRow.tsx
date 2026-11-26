// One plant in the Hydroponics center terminal and in the Botany feature's pinned Hydroponics card (owner,
// 2026-11-22): the plant's icon with its name underneath (wrapping at a hybrid's dash); beside them its status, the
// resources its fruit gives, and its cures, temporary effects and ailment odds as a bulleted caption. A temporary
// effect shows only its name here, with what it does in a popover. Rows sit in a list with dividers between them.

import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { FruitBuffId, ItemTypeId } from "@mush2/shared";
import { itemIcon, PLANT_ICONS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { StatAmount, type StatDelta } from "./StatAmount.tsx";

/** A resource line: a known resource as a `StatDelta`, or free text the sharer wrote ("+1 Spores"). */
export type ResourceLine = StatDelta | { text: string };

export interface PlantNote {
  text: string;
  /** What the note means, in a popover on the text (a temporary effect's name, with what it does). */
  tip?: string;
  /** Drawn in the danger colour (the Mush fruit-lore warning). */
  danger?: boolean;
}

export const FRUIT_BUFF_IDS: readonly FruitBuffId[] = ["treat_disease", "energize", "resistance", "perception"];

/** A fruit's temporary effect as a note: its name, with what it does in a popover. */
export function fruitBuffNote(buff: FruitBuffId, t: TFunction): PlantNote {
  return { text: t(`inspect.fruitBuffNames.${buff}`), tip: t(`inspect.fruitBuffTips.${buff}`) };
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
  species: ItemTypeId;
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
      <div className="plant-row-head">
        {icon && <img className="plant-row-icon" src={icon} alt="" />}
        <strong className="plant-row-name">{names.item(species)}</strong>
      </div>
      <div className="plant-row-side">
        <PlantStatusLines thirst={thirst} sickCycles={sickCycles} young={young} />
        {unknown ? (
          <p className="plant-status-unknown">{unknown}</p>
        ) : (
          <>
            {resources.length > 0 && (
              <ul className="stat-amounts stat-amounts-row">
                {resources.map((line, j) => (
                  <li key={j}>{"stat" in line ? <StatAmount stat={line.stat} amount={line.amount} /> : <span>{line.text}</span>}</li>
                ))}
              </ul>
            )}
            {notes.length > 0 && (
              <ul className="plant-row-notes">
                {notes.map((note, j) => (
                  <li key={j} className={note.danger ? "plant-row-danger" : undefined}>
                    {note.tip ? <NoteTip text={note.text} tip={note.tip} /> : note.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** A note's text that opens what it means on hover, focus or tap (a popover rather than a tooltip, so touch works). */
function NoteTip({ text, tip }: { text: string; tip: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="plant-row-tip">
        {text}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip">{tip}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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

