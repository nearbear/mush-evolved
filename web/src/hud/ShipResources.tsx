import { Tooltip } from "@base-ui/react/tooltip";
import { useTranslation } from "react-i18next";
import type { PlayerView } from "@mush2/shared";
import { SHIP_RESOURCE_ICONS } from "../art/assets.ts";

const RESOURCES = ["oxygen", "fuel", "hull", "plasmaShield", "alerts"] as const;

/** Desktop top bar card with the ship's resource counters, all public. TODO(ship-resources): alerts have no backend yet, so they show a placeholder dash. */
export function ShipResources({ ship }: { ship: PlayerView["ship"] }) {
  const { t } = useTranslation();
  return (
    <Tooltip.Provider delay={300}>
      <ul className="ship-resources" aria-label={t("shipResources.title")}>
        {RESOURCES.map((id) => (
          <li key={id}>
            <Tooltip.Root>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users can open the tooltip, which is the only place the resource is named. */}
              <Tooltip.Trigger className="ship-resource" aria-label={id === "alerts" ? t(`shipResources.${id}`) : `${t(`shipResources.${id}`)}: ${ship[id]}/${ship.max[id]}`} render={<span tabIndex={0} />}>
                <img src={SHIP_RESOURCE_ICONS[id]} alt="" />
                <span className="ship-resource-value">{id === "alerts" ? "–" : `${ship[id]}/${ship.max[id]}`}</span>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner sideOffset={6}>
                  <Tooltip.Popup className="tooltip">{t(`shipResources.${id}`)}{id !== "alerts" && `: ${ship[id]}/${ship.max[id]}`}</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </li>
        ))}
      </ul>
    </Tooltip.Provider>
  );
}
