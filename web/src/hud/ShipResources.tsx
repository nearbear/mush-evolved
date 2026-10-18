import { Tooltip } from "@base-ui/react/tooltip";
import { useTranslation } from "react-i18next";
import { SHIP_RESOURCE_ICONS } from "../art/assets.ts";

const RESOURCES = ["oxygen", "fuel", "shields", "plasmaShield", "alerts"] as const;

/** Desktop top bar card with the ship's resource counters. TODO(ship-resources): no backend yet (#32), so every value is a placeholder dash. */
export function ShipResources() {
  const { t } = useTranslation();
  return (
    <Tooltip.Provider delay={300}>
      <ul className="ship-resources" aria-label={t("shipResources.title")}>
        {RESOURCES.map((id) => (
          <li key={id}>
            <Tooltip.Root>
              <Tooltip.Trigger className="ship-resource" aria-label={t(`shipResources.${id}`)} render={<span tabIndex={0} />}>
                <img src={SHIP_RESOURCE_ICONS[id]} alt="" />
                <span className="ship-resource-value">–</span>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner sideOffset={6}>
                  <Tooltip.Popup className="tooltip">{t(`shipResources.${id}`)}</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </li>
        ))}
      </ul>
    </Tooltip.Provider>
  );
}
