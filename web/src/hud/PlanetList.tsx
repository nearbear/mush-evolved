// Your planets (private to you): name, sectors (revealed tag icons, the rest unknown) and a bin button to delete one.
// Every button comes from view.actions.

import type { Action, EquipmentView, PlanetView, PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { BIN_ICON, PLANET_IMAGES, planetTagIcon } from "../art/assets.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { IconButton } from "./IconButton.tsx";
import { StatusIcon } from "./StatusIcons.tsx";
import "./settings.css";

interface Props {
  view: PlayerView;
  onAction: (action: Action) => void;
  /** The Astro terminal, when shown in its window: adds the scan and analyse buttons. */
  terminal?: EquipmentView;
}

/** Cosmetic: the same planet always gets the same picture. */
const pictureOf = (planet: PlanetView) => PLANET_IMAGES[[...planet.id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % PLANET_IMAGES.length]!;

export function PlanetList({ view, onAction, terminal }: Props) {
  const { t } = useTranslation();
  const scan = terminal && view.actions.find(({ action: a }) => a.type === "scan_planet" && a.equipment === terminal.id);
  return (
    <section className="planet-list" aria-label={t("astro.title")}>
      <h3>{t("astro.title")}</h3>
      {view.planets.length === 0 && terminal && <p>{t("astro.empty")}</p>}
      <ul>
        {view.planets.map((planet) => {
          const analyze = terminal && view.actions.find(({ action: a }) => a.type === "analyze_planet" && a.equipment === terminal.id && a.planet === planet.id);
          const remove = terminal && view.actions.find(({ action: a }) => a.type === "delete_planet" && a.equipment === terminal.id && a.planet === planet.id);
          return (
            <li key={planet.id} className="planet-item">
              <img className="planet-picture" src={pictureOf(planet)} alt="" />
              <div className="planet-body">
                <strong>{planet.name}</strong>
                {planet.orbited && <span className="planet-orbited">{t("astro.orbited")}</span>}
                <span>{t("astro.position", { direction: t(`astro.directions.${planet.direction}`), distance: planet.distance })}</span>
                <span>{t("astro.sectors", { count: planet.sectors.length })}</span>
                <ul className="planet-sectors">
                  {planet.sectors.map((tag, i) => (
                    // Sectors have no id and never reorder.
                    <li key={i}>
                      <StatusIcon icon={planetTagIcon(tag)} name={tag === null ? t("astro.unknown") : t(`astro.tags.${tag}` as never, { defaultValue: tag })} />
                    </li>
                  ))}
                </ul>
              </div>
              {analyze && (
                <ActionButton view={view} option={analyze} onAction={onAction}>
                  <ActionLabel text={t("astro.analyze")} cost={analyze.cost} chance={analyze.chance} />
                </ActionButton>
              )}
              {remove && <IconButton src={BIN_ICON} label={t("astro.delete", { planet: planet.name })} onClick={() => onAction(remove.action)} />}
            </li>
          );
        })}
      </ul>
      {scan && (
        <ActionButton view={view} option={scan} onAction={onAction}>
          <ActionLabel text={t("astro.scan")} cost={scan.cost} chance={scan.chance} />
        </ActionButton>
      )}
    </section>
  );
}
