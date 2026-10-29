// Your planets (private to you): name, sectors (revealed tag icons, the rest unknown) and a bin button to delete one.
// In the Astro terminal's window each planet is its own tab, and while you hold fewer than the most you can, a last
// "New planet" tab holds only the scan button. Every button comes from view.actions.

import { Tabs } from "@base-ui/react/tabs";
import { planetPicture, type Action, type EquipmentView, type PlanetView, type PlayerView } from "@mush2/shared";
import { useState } from "react";
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
  /** The Astro terminal, when shown in its window: adds the tabs, scan and analyse buttons. */
  terminal?: EquipmentView;
}

const NEW_TAB = "new";

export function PlanetList({ view, onAction, terminal }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<string>(NEW_TAB);

  function planetCard(planet: PlanetView) {
    const analyze = terminal && view.actions.find(({ action: a }) => a.type === "analyze_planet" && a.equipment === terminal.id && a.planet === planet.id);
    const remove = terminal && view.actions.find(({ action: a }) => a.type === "delete_planet" && a.equipment === terminal.id && a.planet === planet.id);
    // Development cheat (easyTravel): only offered while it is on.
    const warp = terminal && view.actions.find(({ action: a }) => a.type === "warp_to_planet" && a.equipment === terminal.id && a.planet === planet.id);
    return (
      <div className="planet-item">
        <img className="planet-picture" src={PLANET_IMAGES[planetPicture(planet)]} alt="" />
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
        {warp && (
          <ActionButton view={view} option={warp} onAction={onAction}>
            {t("astro.warp", { planet: planet.name })}
          </ActionButton>
        )}
        {remove && <IconButton src={BIN_ICON} label={t("astro.delete", { planet: planet.name })} onClick={() => onAction(remove.action)} />}
      </div>
    );
  }

  // Outside the terminal window (read-only list): no tabs.
  if (!terminal) {
    return (
      <section className="planet-list" aria-label={t("astro.title")}>
        <h3>{t("astro.title")}</h3>
        <ul>
          {view.planets.map((planet) => (
            <li key={planet.id}>{planetCard(planet)}</li>
          ))}
        </ul>
      </section>
    );
  }

  const scan = view.actions.find(({ action: a }) => a.type === "scan_planet" && a.equipment === terminal.id);
  const hasNewTab = view.planets.length < view.maxPlanets;
  // A deleted planet's tab is gone: fall back to the first tab that exists.
  const current = view.planets.some((p) => p.id === tab) || (tab === NEW_TAB && hasNewTab) ? tab : (view.planets[0]?.id ?? NEW_TAB);
  return (
    <Tabs.Root className="settings-tabs planet-list" value={current} onValueChange={(value) => setTab(value as string)}>
      <Tabs.List className="settings-tab-list progress-tab-list" aria-label={t("astro.title")}>
        {view.planets.map((planet) => (
          <Tabs.Tab key={planet.id} className="settings-tab" value={planet.id}>
            {planet.name}
          </Tabs.Tab>
        ))}
        {hasNewTab && (
          <Tabs.Tab className="settings-tab" value={NEW_TAB}>
            {t("astro.newPlanetTab")}
          </Tabs.Tab>
        )}
      </Tabs.List>
      {view.planets.map((planet) => (
        <Tabs.Panel key={planet.id} value={planet.id}>
          {planetCard(planet)}
        </Tabs.Panel>
      ))}
      {hasNewTab && (
        <Tabs.Panel value={NEW_TAB}>
          {scan && (
            <div className="command-destinations">
              <ActionButton view={view} option={scan} onAction={onAction} className="big">
                <ActionLabel text={t("astro.scan")} cost={scan.cost} chance={scan.chance} />
              </ActionButton>
            </div>
          )}
        </Tabs.Panel>
      )}
    </Tabs.Root>
  );
}
