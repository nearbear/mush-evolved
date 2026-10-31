import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import type { PlayerView } from "@mush2/shared";
import { SHIP_RESOURCE_ICONS } from "../art/assets.ts";
import { TitleChip } from "./TitleChip.tsx";

const RESOURCES = ["oxygen", "fuel", "hull", "plasmaShield", "hunters", "alerts"] as const;

/**
 * The ship card (in the desktop top bar, and ShipOverlay on phones) with the ship's resource counters, how many hunters
 * are attacking, the ship titles, and the orbited planet's name while in orbit (owner, 2026-10-31), all public. TODO(ship-resources): alerts have no backend yet, so they show a placeholder dash.
 */
export function ShipResources({ ship, hunters, titles, orbit }: { ship: PlayerView["ship"]; hunters: number; titles: PlayerView["titles"]; orbit: string | null }) {
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
      {titles.map((title) => (
        <li key={title.id} className="ship-title">
          <TitleChip entry={title} />
        </li>
      ))}
    </ul>
  );
}
