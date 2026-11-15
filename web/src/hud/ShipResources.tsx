import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { doorRooms, type PlayerView } from "@mush2/shared";
import { SHIP_RESOURCE_ICONS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { TitleChip, TitlesChip } from "./TitleChip.tsx";
import { useCountdown } from "./useCountdown.ts";

const RESOURCES = ["oxygen", "fuel", "hull", "plasmaShield", "hunters", "fires", "alerts"] as const;

/**
 * The ship card (in the desktop top bar, and ShipOverlay on phones) with the ship's resource counters, how many hunters
 * are attacking, active fires, broken equipment alerts, the ship titles, the orbited planet's name while in orbit
 * (owner, 2026-10-31), and the expedition away: who, where and when they are back (owner, 2026-11-07), all public.
 * Fires count every fire aboard and alerts count every broken piece of equipment; each popover locates only the
 * reported ones (owner, 2026-11-14, #444).
 */
export function ShipResources({
  ship,
  hunters,
  titles,
  preselection = false,
  compactTitles = false,
  orbit,
  expedition,
  lost,
  alerts,
}: {
  ship: PlayerView["ship"];
  hunters: number;
  titles: PlayerView["titles"];
  preselection?: boolean;
  compactTitles?: boolean;
  orbit: string | null;
  expedition: PlayerView["expedition"];
  lost: PlayerView["lost"];
  alerts: PlayerView["alerts"];
}) {
  const { t } = useTranslation();
  return (
    <ul className="ship-resources" aria-label={t("shipResources.title")}>
      {RESOURCES.map((id) => {
        const name = t(`shipResources.${id}`);
        const value =
          id === "fires"
            ? String(alerts.fires)
            : id === "alerts"
              ? String(alerts.broken)
              : id === "hunters"
                ? String(hunters)
                : `${ship[id]}/${ship.max[id]}`;
        // A fixed-width slot (the widest reading, in tabular figures), so a changing value never shifts its neighbours.
        const width = id === "fires" || id === "alerts" || id === "hunters" ? 2 : 2 * String(ship.max[id]).length + 1;
        // Nothing to report (no hunters, no fires, no alerts) is muted. Values get no warning colour: no thresholds are decided (owner, 2026-11-12).
        const empty = (id === "hunters" && hunters === 0) || (id === "fires" && alerts.fires === 0) || (id === "alerts" && alerts.broken === 0);
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
                aria-label={`${name}: ${value}`}
              >
                <img src={SHIP_RESOURCE_ICONS[id]} alt="" />
                <span className="ship-resource-value" style={{ minWidth: `${width}ch` }}>
                  {id === "fires" || id === "alerts" || id === "hunters" ? (
                    value
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
                  <Popover.Popup className="tooltip">
                    {`${name}: ${value}`}
                    {id === "fires" && <AlertList kind="fire" total={alerts.fires} reports={alerts.reports} />}
                    {id === "alerts" && <AlertList kind="equipment" total={alerts.broken} reports={alerts.reports} />}
                  </Popover.Popup>
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
      {compactTitles
        ? titles.length > 0 && (
            <li className="ship-title">
              <TitlesChip titles={titles} preselection={preselection} />
            </li>
          )
        : titles.map((title) => (
            <li key={title.id} className="ship-title">
              <TitleChip entry={title} preselection={preselection} />
            </li>
          ))}
    </ul>
  );
}

/** The reported fires or breakdowns (equipment and doors), then how many more there are that nobody reported. */
function AlertList({
  kind,
  total,
  reports,
}: {
  kind: "fire" | "equipment";
  total: number;
  reports: PlayerView["alerts"]["reports"];
}) {
  const { t } = useTranslation();
  const names = useNames();
  const matching = reports.filter((r) => (kind === "fire" ? r.kind === "fire" : r.kind === "equipment" || r.kind === "door"));
  const unreported = total - matching.length;
  if (total === 0) return null;
  return (
    <ul className="alert-list">
      {matching.map((r, i) => {
        const detector = r.by === "FIRE_SENSOR" || r.by === "EQUIPMENT_SENSOR" || r.by === "DOOR_SENSOR" ? names.project(r.by) : null;
        let text: string;
        if (r.kind === "fire") {
          const room = names.room(r.room);
          text =
            detector !== null
              ? t("shipResources.alertFireDetector", { room, detector })
              : t("shipResources.alertFire", { room, name: names.characterGiven(r.by) });
        } else if (r.kind === "equipment") {
          const room = names.room(r.room);
          text =
            detector !== null
              ? t("shipResources.alertBrokenDetector", { room, equipment: names.equipment(r.equipment), detector })
              : t("shipResources.alertBroken", { room, equipment: names.equipment(r.equipment), name: names.characterGiven(r.by) });
        } else {
          const [a, b] = doorRooms(r.door);
          const roomA = names.room(a);
          const roomB = names.room(b);
          text =
            detector !== null
              ? t("shipResources.alertDoorDetector", { roomA, roomB, detector })
              : t("shipResources.alertDoor", { roomA, roomB, name: names.characterGiven(r.by) });
        }
        // By position: two broken pieces of one type in one room share a room and a type. The list is short and rebuilt whole.
        return <li key={i}>{text}</li>;
      })}
      {unreported > 0 && <li className="sub">{t("shipResources.alertsUnreported", { count: unreported })}</li>}
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
