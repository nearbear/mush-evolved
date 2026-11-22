// The Hydroponics center (`PLANT_CONTROLLER`) terminal window (owner, 2026-11-21): displays planted hydropots on the
// greenhouse floor as a vertical list — each row showing (icon + name stacked) -> effects stacked -> statuses stacked —
// and lets a living player with an iTrackie share an editable status snapshot to the Botany feature tab.

import {
  isAlienFruitType,
  ITEM_TYPES,
  MAX_SHARED_PLANT_EFFECTS_LENGTH,
  MAX_SHARED_PLANT_SICK_CYCLES,
  MAX_SHARED_PLANT_TEXT_LENGTH,
  TREE_POT_ITEM,
  type EquipmentView,
  type FruitBuffId,
  type ItemView,
  type PlayerView,
  type SharedPlantRow,
} from "@mush2/shared";
import { useEffect, useId, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { AP_PIP, HP_ICON, itemIcon, MORALE_ICON, MP_PIP, PLANT_ICONS, SATIETY_ICON } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { isMushOnlyFruitLore } from "./ConsumeEffects.tsx";

const FRUIT_BUFF_KEYS = {
  treat_disease: "inspect.fruitBuffs.treat_disease",
  energize: "inspect.fruitBuffs.energize",
  resistance: "inspect.fruitBuffs.resistance",
  perception: "inspect.fruitBuffs.perception",
} as const satisfies Record<FruitBuffId, string>;

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onShare?: (plants: SharedPlantRow[], text: string) => void;
}

/** Effects of a plant's fruit as plain localized lines (one per line), used to prefill the Share form. */
function prefillEffects(species: string, view: PlayerView, t: TFunction): string {
  const consume = ITEM_TYPES[species]?.consume;
  if (!consume) return "";
  const isAlien = isAlienFruitType(species);
  const fruit = isAlien ? view.fruitEffects?.[species] : undefined;
  if (isAlien && !fruit) return "";
  const lines: string[] = [];
  const stats: [number | undefined, string][] = [
    [consume.ap + (fruit?.ap ?? 0), t("stat.ap")],
    [consume.mp ?? 0, t("stat.mp")],
    [consume.satiety, t("itemAttr.satiety")],
    [(consume.morale ?? 0) + (fruit?.morale ?? 0), t("stat.morale")],
    [(consume.hp ?? 0) + (fruit?.hp ?? 0), t("stat.hp")],
  ];
  for (const [n, label] of stats) {
    if (n) lines.push(`${n > 0 ? "+" : "−"}${Math.abs(n)} ${label}`);
  }
  if (fruit) {
    for (const buff of fruit.buffs) lines.push(t(FRUIT_BUFF_KEYS[buff]));
    for (const d of fruit.diseases) {
      lines.push(
        t("inspect.fruitDiseaseOdds", {
          disease: t(`status.${d.id}` as never, { defaultValue: t(d.id as never, { defaultValue: d.id }) }),
          percent: Math.round(d.odds * 100),
        }),
      );
    }
  }
  return lines.join("\n").slice(0, MAX_SHARED_PLANT_EFFECTS_LENGTH);
}

/** Stacked effects for a live plant in the terminal, respecting the viewer's fruit lore visibility. */
function LivePlantEffects({ species, view }: { species: string; view: PlayerView }) {
  const { t } = useTranslation();
  const consume = ITEM_TYPES[species]?.consume;
  if (!consume) return null;
  const isAlien = isAlienFruitType(species);
  const fruit = isAlien ? view.fruitEffects?.[species] : undefined;
  if (isAlien && !fruit) {
    return <p className="plant-status-unknown">{t("botanyTerminal.effectsUnknown")}</p>;
  }
  const stats: [number | undefined, string, string][] = [
    [consume.ap + (fruit?.ap ?? 0), AP_PIP, t("stat.ap")],
    [consume.mp ?? 0, MP_PIP, t("stat.mp")],
    [consume.satiety, SATIETY_ICON, t("itemAttr.satiety")],
    [(consume.morale ?? 0) + (fruit?.morale ?? 0), MORALE_ICON, t("stat.morale")],
    [(consume.hp ?? 0) + (fruit?.hp ?? 0), HP_ICON, t("stat.hp")],
  ];
  const shown = stats.filter(([n]) => n);
  const mushWarning = fruit ? isMushOnlyFruitLore(view) : false;
  return (
    <ul className="plant-status-effects">
      {shown.map(([n, icon, label]) => (
        <li key={label} className="plant-status-effect-stat">
          <img src={icon} alt="" />
          <span>{`${n! > 0 ? "+" : "−"}${Math.abs(n!)} ${label}`}</span>
        </li>
      ))}
      {fruit?.buffs.map((buff) => (
        <li key={buff} className="plant-status-effect-buff">
          {t(FRUIT_BUFF_KEYS[buff])}
        </li>
      ))}
      {fruit?.diseases.map((d) => (
        <li key={d.id} className="plant-status-effect-disease">
          {t("inspect.fruitDiseaseOdds", {
            disease: t(`status.${d.id}`, { defaultValue: t(d.id as never, { defaultValue: d.id }) }),
            percent: Math.round(d.odds * 100),
          })}
        </li>
      ))}
      {mushWarning && <li className="consume-mush-warning">{t("inspect.fruitMushWarning")}</li>}
    </ul>
  );
}

/** Stacked statuses for a live or shared plant. */
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

export function PlantTerminal({ terminal, view, onShare }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  const [sharing, setSharing] = useState(false);
  const refocusShare = useRef(false);

  const planted: (ItemView & { plant: NonNullable<ItemView["plant"]> })[] = view.roomItems.filter(
    (item): item is ItemView & { plant: NonNullable<ItemView["plant"]> } => item.type === TREE_POT_ITEM && item.plant !== undefined,
  );

  if (sharing && onShare) {
    const initialRows: SharedPlantRow[] = planted.map(({ plant }) => ({
      species: plant.species,
      effects: prefillEffects(plant.species, view, t),
      thirst: plant.thirst,
      sickCycles: plant.sick ? (plant.sickCycles ?? 1) : null,
      young: plant.age !== null,
    }));
    return (
      <SharePlantsForm
        initialRows={initialRows}
        onPost={(rows, text) => {
          onShare(rows, text);
          setSharing(false);
        }}
        onBack={() => {
          refocusShare.current = true;
          setSharing(false);
        }}
      />
    );
  }

  return (
    <div className="plant-terminal" role="group" aria-label={t("botanyTerminal.label")}>
      {terminal.broken && <p className="sub">{t("botanyTerminal.broken")}</p>}
      {planted.length === 0 ? (
        <p className="sub">{t("botanyTerminal.empty")}</p>
      ) : (
        <ul className="plant-status-list" aria-label={t("botanyTerminal.listLabel")}>
          {planted.map(({ id, plant }) => {
            const icon = itemIcon(plant.species);
            return (
              <li key={id} className="plant-status-row">
                <div className="plant-status-head">
                  {icon && <img className="plant-status-icon" src={icon} alt="" />}
                  <strong className="plant-status-name">{names.item(plant.species)}</strong>
                </div>
                <div className="plant-status-col">
                  <LivePlantEffects species={plant.species} view={view} />
                </div>
                <div className="plant-status-col">
                  <PlantStatusLines
                    thirst={plant.thirst}
                    sickCycles={plant.sick ? (plant.sickCycles ?? 1) : null}
                    young={plant.age !== null}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {onShare && view.canSharePlants && (
        <div className="plant-terminal-actions">
          <button
            type="button"
            ref={(el) => {
              if (el && refocusShare.current) {
                refocusShare.current = false;
                el.focus();
              }
            }}
            onClick={() => setSharing(true)}
          >
            {t("botanyTerminal.share")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Editable share form inside the Hydroponics center terminal window (mirrors SharePlanetForm). */
function SharePlantsForm({
  initialRows,
  onPost,
  onBack,
}: {
  initialRows: SharedPlantRow[];
  onPost: (rows: SharedPlantRow[], text: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const headingId = useId();
  const [rows, setRows] = useState<SharedPlantRow[]>(() => initialRows.map((r) => ({ ...r })));
  const [text, setText] = useState("");
  const firstInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => firstInput.current?.focus(), []);

  const updateRow = (index: number, patch: Partial<SharedPlantRow>) => {
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number) => {
    setRows((list) => list.filter((_, i) => i !== index));
  };

  return (
    <form
      className="share-planet-form share-plants-form"
      aria-labelledby={headingId}
      onSubmit={(e) => {
        e.preventDefault();
        onPost(rows, text);
      }}
    >
      <h3 id={headingId}>{t("botanyTerminal.shareTitle")}</h3>
      <p className="sub">{t("botanyTerminal.shareHint")}</p>
      {rows.length === 0 ? (
        <p className="sub">{t("botanyTerminal.empty")}</p>
      ) : (
        <ul className="share-plants-rows">
          {rows.map((row, i) => {
            const icon = itemIcon(row.species);
            const label = names.item(row.species);
            return (
              <li key={`${row.species}-${i}`} className="share-plants-row">
                <div className="share-plants-row-head">
                  <div className="plant-status-head">
                    {icon && <img className="plant-status-icon" src={icon} alt="" />}
                    <strong className="plant-status-name">{label}</strong>
                  </div>
                  <button type="button" className="share-plants-remove" onClick={() => removeRow(i)}>
                    {t("botanyTerminal.removeRow")}
                  </button>
                </div>
                <label className="share-plants-field">
                  <span>{t("botanyTerminal.effectsLabel")}</span>
                  <textarea
                    ref={i === 0 ? firstInput : undefined}
                    value={row.effects}
                    onChange={(e) => updateRow(i, { effects: e.target.value })}
                    maxLength={MAX_SHARED_PLANT_EFFECTS_LENGTH}
                    rows={2}
                    placeholder={t("botanyTerminal.effectsPlaceholder")}
                  />
                </label>
                <div className="share-plants-controls">
                  <label className="share-plants-select">
                    <span>{t("botanyTerminal.thirstLabel")}</span>
                    <select
                      value={row.thirst}
                      onChange={(e) => updateRow(i, { thirst: Number(e.target.value) as 0 | 1 | 2 })}
                    >
                      <option value={0}>{t("botanyTerminal.thirstNone")}</option>
                      <option value={1}>{t("itemAttr.thirsty")}</option>
                      <option value={2}>{t("botanyTerminal.driedOut")}</option>
                    </select>
                  </label>
                  <label className="share-plants-check">
                    <input
                      type="checkbox"
                      checked={row.sickCycles !== null}
                      onChange={(e) => updateRow(i, { sickCycles: e.target.checked ? 1 : null })}
                    />
                    <span>{t("itemAttr.sick")}</span>
                  </label>
                  {row.sickCycles !== null && (
                    <label className="share-plants-cycles">
                      <span>{t("botanyTerminal.cyclesLabel")}</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_SHARED_PLANT_SICK_CYCLES}
                        value={row.sickCycles}
                        onChange={(e) => {
                          const parsed = Number.parseInt(e.target.value, 10);
                          const clamped = Number.isFinite(parsed)
                            ? Math.max(1, Math.min(MAX_SHARED_PLANT_SICK_CYCLES, parsed))
                            : 1;
                          updateRow(i, { sickCycles: clamped });
                        }}
                      />
                    </label>
                  )}
                  <label className="share-plants-check">
                    <input
                      type="checkbox"
                      checked={row.young}
                      onChange={(e) => updateRow(i, { young: e.target.checked })}
                    />
                    <span>{t("itemAttr.young")}</span>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sub share-planet-disclaimer">{t("botanyTerminal.shareDisclaimer")}</p>
      <label className="share-planet-text">
        <span>{t("botanyTerminal.noteLabel")}</span>
        <textarea
          ref={rows.length === 0 ? firstInput : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_SHARED_PLANT_TEXT_LENGTH}
          rows={3}
          placeholder={t("botanyTerminal.notePlaceholder")}
        />
      </label>
      <span className="sub share-planet-count" aria-hidden="true">
        {text.length}/{MAX_SHARED_PLANT_TEXT_LENGTH}
      </span>
      <div className="share-planet-buttons">
        <button type="button" onClick={onBack}>
          {t("astro.back")}
        </button>
        <button type="submit">{t("botanyTerminal.sharePost")}</button>
      </div>
    </form>
  );
}
