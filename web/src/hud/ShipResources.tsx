import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import type { PlayerView } from "@mush2/shared";
import { SHIP_RESOURCE_ICONS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { TitleChip } from "./TitleChip.tsx";
import { useCountdown } from "./useCountdown.ts";

const RESOURCES = ["oxygen", "fuel", "hull", "plasmaShield", "hunters", "alerts"] as const;

/**
 * The ship card (in the desktop top bar, and ShipOverlay on phones) with the ship's resource counters, how many hunters
 * are attacking, the ship titles, the orbited planet's name while in orbit (owner, 2026-10-31), and the expedition
 * away: who, where and when they are back (owner, 2026-11-07), all public. TODO(ship-resources): alerts have no backend yet, so they show a placeholder dash.
 */
export function ShipResources({ ship, hunters, titles, orbit, expedition, clockOffset }: { ship: PlayerView["ship"]; hunters: number; titles: PlayerView["titles"]; orbit: string | null; expedition: PlayerView["expedition"]; clockOffset: number }) {
  const { t } = useTranslation();
  return (
    <ul className="ship-resources" aria-label={t("shipResources.title")}>
      {RESOURCES.map((id) => {
        const name = t(`shipResources.${id}`);
        const value = id === "alerts" ? null : id === "hunters" ? String(hunters) : `${ship[id]}/${ship.max[id]}`;
        return (
          <li key={id}>
            {/* A popover, not a tooltip, so a tap opens it on phones (touch has no hover). */}
            <Popover.Root>
              <Popover.Trigger
                openOnHover
                delay={300}
                nativeButton={false}
                render={<span role="button" tabIndex={0} />}
                className="ship-resource"
                aria-label={value === null ? name : `${name}: ${value}`}
              >
                <img src={SHIP_RESOURCE_ICONS[id]} alt="" />
                <span className="ship-resource-value">{value ?? "–"}</span>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner sideOffset={6}>
                  <Popover.Popup className="tooltip">{value === null ? name : `${name}: ${value}`}</Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </li>
        );
      })}
      {orbit !== null && <li className="ship-orbit">{t("shipResources.orbit", { name: orbit })}</li>}
      {expedition && <ExpeditionAway expedition={expedition} clockOffset={clockOffset} />}
      {titles.map((title) => (
        <li key={title.id} className="ship-title">
          <TitleChip entry={title} />
        </li>
      ))}
    </ul>
  );
}

/** Who is out on the expedition, on which planet, and the time left. */
function ExpeditionAway({ expedition, clockOffset }: { expedition: NonNullable<PlayerView["expedition"]>; clockOffset: number }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const time = useCountdown(expedition.returnAt, clockOffset);
  const crew = new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(expedition.crew.map((c) => names.characterGiven(c)));
  return <li className="ship-orbit">{t("shipResources.expedition", { planet: expedition.planet, names: crew, time })}</li>;
}
