// Your planets (private to you): name, sectors (revealed tag icons, the rest unknown) and a bin button to delete one.
// In the Astro terminal's window each planet is its own tab, and while you hold fewer than the most you can, a last
// "New planet" tab holds only the scan button. Every button comes from view.actions.

import { Tabs } from "@base-ui/react/tabs";
import { planetPicture, type Action, type EquipmentView, type PlanetTag, type PlanetView, type PlayerView } from "@mush2/shared";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BIN_ICON, PLANET_IMAGES, planetTagIcon, SHIP_RESOURCE_ICONS } from "../art/assets.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ConfirmPanel } from "./ConfirmPanel.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { StatusIcon } from "./StatusIcons.tsx";
import { SharePlanetForm } from "./SharePlanetForm.tsx";
import "./settings.css";

interface Props {
  view: PlayerView;
  onAction: (action: Action) => void;
  /** The Astro terminal, when shown in its window: adds the tabs, scan and analyse buttons. */
  terminal?: EquipmentView;
  /** Shares a planet in the Astrophysics feature (not an action: free, with free text). Offered in the terminal window only. */
  onShare?: (planet: string, sectors: (PlanetTag | null)[], text: string) => void;
}

const NEW_TAB = "new";

export function PlanetList({ view, onAction, terminal, onShare }: Props) {
  const { t } = useTranslation();
  // null until the player picks a tab: the leftmost one shows first.
  const [tab, setTab] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // The planet whose Share form replaces its card, if any; leaving its tab drops the form.
  const [sharing, setSharing] = useState<string | null>(null);
  // After Back, focus returns to the Share button that opened the form.
  const refocusShare = useRef(false);
  const knownPlanets = useRef(new Set(view.planets.map((p) => p.id)));

  // A newly discovered planet opens on its own tab, never on the "New planet" tab it was scanned from.
  useEffect(() => {
    const found = view.planets.find((p) => !knownPlanets.current.has(p.id));
    knownPlanets.current = new Set(view.planets.map((p) => p.id));
    if (found) setTab(found.id);
  }, [view.planets]);

  function planetCard(planet: PlanetView) {
    const analyze = terminal && view.actions.find(({ action: a }) => a.type === "analyze_planet" && a.equipment === terminal.id && a.planet === planet.id);
    const remove = terminal && view.actions.find(({ action: a }) => a.type === "delete_planet" && a.equipment === terminal.id && a.planet === planet.id);
    // Development cheat (easyTravel): only offered while it is on.
    const warp = terminal && view.actions.find(({ action: a }) => a.type === "warp_to_planet" && a.equipment === terminal.id && a.planet === planet.id);
    const known = planet.sectors.filter((tag) => tag !== null).length;
    return (
      <div className="planet-item">
        <span className="planet-position">
          <span className="sr-only">{t("astro.position", { direction: t(`astro.directions.${planet.direction}`), distance: planet.distance })}</span>
          <span aria-hidden="true">
            {t(`astro.directions.${planet.direction}`)}, {planet.distance}
          </span>
          <img src={SHIP_RESOURCE_ICONS.fuel} alt="" />
        </span>
        <div className="planet-title">
          <strong>{planet.name}</strong>
          <span className="planet-sector-count">
            <span className="sr-only">{t("astro.sectorProgress", { known, total: planet.sectors.length })}</span>
            <span aria-hidden="true">
              ({known}/{planet.sectors.length})
            </span>
          </span>
          {planet.orbited && <span className="planet-orbited">{t("astro.orbited")}</span>}
        </div>
        <img className="planet-picture" src={PLANET_IMAGES[planetPicture(planet)]} alt="" />
        <div className="planet-body">
          <ul className="planet-sectors">
            {planet.sectors.map((tag, i) => (
              // Sectors have no id and never reorder.
              <li key={i}>
                <StatusIcon icon={planetTagIcon(tag)} name={tag === null ? t("astro.unknown") : t(`astro.tags.${tag}` as never, { defaultValue: tag })} />
              </li>
            ))}
          </ul>
        </div>
        <div className="planet-actions">
          {analyze && (
            <ActionButton view={view} option={analyze} onAction={onAction}>
              <ActionLabel text={t("astro.analyze")} cost={analyze.cost} chance={analyze.chance} />
            </ActionButton>
          )}
          {warp && (
            <ActionButton view={view} option={warp} onAction={onAction}>
              {t("astro.warp")}
            </ActionButton>
          )}
          {terminal && onShare && view.canSharePlanets && (
            <button
              type="button"
              ref={(el) => {
                if (el && refocusShare.current) {
                  refocusShare.current = false;
                  el.focus();
                }
              }}
              onClick={() => setSharing(planet.id)}
            >
              {t("astro.share")}
            </button>
          )}
          {remove && (
            <>
              <button type="button" className="planet-delete" onClick={() => setConfirmDelete(planet.id)}>
                <img src={BIN_ICON} alt="" />
                {t("astro.delete")}
              </button>
              <ConfirmPanel
                open={confirmDelete === planet.id}
                onOpenChange={(o) => !o && setConfirmDelete(null)}
                message={t("astro.deleteConfirm", { name: planet.name })}
                yesLabel={t("astro.deleteYes")}
                backLabel={t("astro.back")}
                onYes={() => {
                  onAction(remove.action);
                  setConfirmDelete(null);
                }}
              />
            </>
          )}
        </div>
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
  const current = tab !== null && (view.planets.some((p) => p.id === tab) || (tab === NEW_TAB && hasNewTab)) ? tab : (view.planets[0]?.id ?? NEW_TAB);
  return (
    <Tabs.Root className="settings-tabs planet-list" value={current} onValueChange={(value) => {
        setTab(value as string);
        setSharing(null);
      }}
    >
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
          {sharing === planet.id && onShare ? (
            <SharePlanetForm
              planet={planet}
              onPost={(sectors, text) => {
                onShare(planet.id, sectors, text);
                setSharing(null);
              }}
              onBack={() => {
                refocusShare.current = true;
                setSharing(null);
              }}
            />
          ) : (
            planetCard(planet)
          )}
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
