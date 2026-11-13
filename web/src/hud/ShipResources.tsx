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
export function ShipResources({ ship, hunters, titles, orbit, expedition, lost }: { ship: PlayerView["ship"]; hunters: number; titles: PlayerView["titles"]; orbit: string | null; expedition: PlayerView["expedition"]; lost: PlayerView["lost"] }) {
  const { t } = useTranslation();
  return (
    <ul className="ship-resources" aria-label={t("shipResources.title")}>
      {RESOURCES.map((id) => {
        const name = t(`shipResources.${id}`);
        const value = id === "alerts" ? null : id === "hunters" ? String(hunters) : `${ship[id]}/${ship.max[id]}`;
        // A fixed-width slot (the widest reading, in tabular figures), so a changing value never shifts its neighbours.
        const width = id === "alerts" || id === "hunters" ? 2 : 2 * String(ship.max[id]).length + 1;
        // Nothing to report (no hunters, no alert) is muted. Values get no warning colour: no thresholds are decided (owner, 2026-11-12).
        const empty = value === null || (id === "hunters" && hunters === 0);
        return (
          <li key={id} className={empty ? "empty" : undefined}>
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
                <span className="ship-resource-value" style={{ minWidth: `${width}ch` }}>
                  {id === "alerts" || id === "hunters" ? (
                    (value ?? "–")
                  ) : (
                    <>
                      {ship[id]}
                      <span className="ship-resource-max">/{ship.max[id]}</span>
                    </>
                  )}
                </span>
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
      {expedition && <ExpeditionAway expedition={expedition} />}
      {lost.map((l) => (
        <LostAlert key={l.name} entry={l} />
      ))}
      {titles.map((title) => (
        <li key={title.id} className="ship-title">
          <TitleChip entry={title} />
        </li>
      ))}
    </ul>
  );
}

/** A crewmate lost on a planet: a public alert (owner, 2026-11-08, #357). */
function LostAlert({ entry }: { entry: PlayerView["lost"][number] }) {
  const { t } = useTranslation();
  const names = useNames();
  return <li className="ship-orbit">{t("shipResources.lost", { name: names.characterGiven(entry.name), planet: entry.planet })}</li>;
}

/** Who is out on the expedition, on which planet, and the time left. */
function ExpeditionAway({ expedition }: { expedition: NonNullable<PlayerView["expedition"]> }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const time = useCountdown(expedition.returnAt);
  const crew = new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(expedition.crew.map((c) => names.characterGiven(c)));
  const text =
    expedition.ship !== undefined
      ? t("shipResources.expeditionShip", { planet: expedition.planet, ship: names.room(expedition.ship), names: crew, time })
      : t("shipResources.expedition", { planet: expedition.planet, names: crew, time });
  return <li className="ship-orbit">{text}</li>;
}
