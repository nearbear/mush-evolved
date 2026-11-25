import { Popover } from "@base-ui/react/popover";
import { Trans, useTranslation } from "react-i18next";
import { DEFAULT_CONFIG, doorRooms, type PlayerView } from "@mush2/shared";
import { GRAVITY_ICON, SHIP_RESOURCE_ICONS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { CrewBar, type CrewProps } from "./CrewBar.tsx";
import { TitleChip, TitlesChip } from "./TitleChip.tsx";

const SHIP_COUNTERS = ["oxygen", "fuel", "hull", "plasmaShield"] as const;
const ALERT_COUNTERS = ["hunters", "fires", "alerts"] as const;
type CounterId = (typeof SHIP_COUNTERS)[number] | (typeof ALERT_COUNTERS)[number];

/**
 * The ship card (in the desktop top bar, and ShipOverlay on phones) with the ship's resource counters, how many hunters
 * are attacking, active fires, broken equipment alerts, crewmates lost on a planet, and the ship titles, all public.
 * Where the ship is (orbit, expedition) is in ShipStatus.tsx, right of the clock. The desktop top bar moves hunters, fires
 * and alerts out to the AlertBar (`alertsApart`).
 * Fires count every fire aboard and alerts count every broken piece of equipment; each popover locates only the
 * reported ones (owner, 2026-11-14, #444). The Gravity Simulator has its own row in the alerts popover while gravity is
 * down (`alerts.gravity`, eMush's `no_gravity` and `gravity_reboot`; owner, 2026-11-22).
 */
export function ShipResources({
  ship,
  hunters,
  titles,
  preselection = false,
  compactTitles = false,
  alertsApart = false,
  lost,
  alerts,
  crew,
}: {
  ship: NonNullable<PlayerView["ship"]>;
  hunters: number;
  titles: PlayerView["titles"];
  preselection?: boolean;
  compactTitles?: boolean;
  /** Leave hunters, fires and alerts out: they are in the AlertBar. */
  alertsApart?: boolean;
  lost: PlayerView["lost"];
  alerts: PlayerView["alerts"];
  /** Who is aboard, as the crew bar (CrewBar.tsx) draws it, before the titles. */
  crew?: CrewProps | undefined;
}) {
  const { t } = useTranslation();
  const ids: readonly CounterId[] = alertsApart ? SHIP_COUNTERS : [...SHIP_COUNTERS, ...ALERT_COUNTERS];
  return (
    <ul className="ship-resources" aria-label={t("shipResources.title")}>
      {ids.map((id) => (
        <Counter key={id} id={id} ship={ship} hunters={hunters} alerts={alerts} />
      ))}
      {lost.map((l) => (
        <LostAlert key={l.name} entry={l} />
      ))}
      {crew && (
        <li className="crew-item">
          <CrewBar {...crew} />
        </li>
      )}
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

/**
 * Desktop top bar: hunters, fires and alerts in the original game's alarm bar, left of the actions. It flashes red (the
 * original's animated "on" art) while there are hunters or fires; broken equipment alone leaves it calm.
 */
export function AlertBar({ ship, hunters, alerts }: { ship: NonNullable<PlayerView["ship"]>; hunters: number; alerts: PlayerView["alerts"] }) {
  const { t } = useTranslation();
  const on = hunters > 0 || alerts.fires > 0;
  return (
    <ul className={on ? "alert-bar on" : "alert-bar"} aria-label={t("shipResources.alertBar")}>
      {ALERT_COUNTERS.map((id) => (
        <Counter key={id} id={id} ship={ship} hunters={hunters} alerts={alerts} />
      ))}
    </ul>
  );
}

/**
 * Phones: the AlertBar folded to one alert icon in the same alarm frame (flashing red while there are hunters or fires).
 * Its popover holds hunters, fires and broken equipment, each in its own section.
 */
export function AlertButton({ hunters, alerts }: { hunters: number; alerts: PlayerView["alerts"] }) {
  const { t } = useTranslation();
  const on = hunters > 0 || alerts.fires > 0;
  const counts = { hunters, fires: alerts.fires, alerts: alertCount(alerts) };
  const empty = !on && counts.alerts === 0;
  const lines = ALERT_COUNTERS.map((id) => `${t(`shipResources.${id}`)}: ${counts[id]}`);
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={300}
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className={["alert-bar", "alert-button", on && "on", empty && "empty"].filter(Boolean).join(" ")}
        aria-label={`${t("shipResources.alertBar")}: ${lines.join(", ")}`}
      >
        <img src={SHIP_RESOURCE_ICONS.alerts} alt="" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end">
          <Popover.Popup className="tooltip alert-popup">
            {ALERT_COUNTERS.map((id, i) => (
              <section key={id} className={counts[id] === 0 ? "empty" : undefined}>
                <strong className="alert-popup-head">
                  <img src={SHIP_RESOURCE_ICONS[id]} alt="" />
                  {lines[i]}
                </strong>
                {id === "fires" && <AlertList kind="fire" total={alerts.fires} reports={alerts.reports} />}
                {id === "alerts" && <BreakdownAlerts alerts={alerts} />}
              </section>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** One counter with its popover. */
function Counter({ id, ship, hunters, alerts }: { id: CounterId; ship: NonNullable<PlayerView["ship"]>; hunters: number; alerts: PlayerView["alerts"] }) {
  const { t } = useTranslation();
  const name = t(`shipResources.${id}`);
  const value =
    id === "fires"
      ? String(alerts.fires)
      : id === "alerts"
        ? String(alertCount(alerts))
        : id === "hunters"
          ? String(hunters)
          : `${ship[id]}/${ship.max[id]}`;
  // No fixed-width slot: one sized for the widest reading left a gap after a short value (55/100). Tabular figures keep
  // a value's width steady until its digit count changes, which is rare.
  // Nothing to report (no hunters, no fires, no alerts) is muted. Values get no warning colour: no thresholds are decided (owner, 2026-11-12).
  const empty = (id === "hunters" && hunters === 0) || (id === "fires" && alerts.fires === 0) || (id === "alerts" && alertCount(alerts) === 0);
  return (
    <li className={empty ? "empty" : undefined}>
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
          <span className="ship-resource-value">
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
              {id === "alerts" && <BreakdownAlerts alerts={alerts} />}
              {(id === "oxygen" || id === "fuel" || id === "hull" || id === "plasmaShield") && <ResourceInfo id={id} />}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </li>
  );
}

/**
 * The alerts counter: every broken piece of equipment and door, plus a restarting Gravity Simulator. A broken one is
 * already in `broken`, so it isn't added again.
 */
export const alertCount = (alerts: PlayerView["alerts"]): number => alerts.broken + (alerts.gravity === "restarting" ? 1 : 0);

/**
 * The alerts popover's body: the gravity row, then the reported breakdowns. A broken Gravity Simulator is never reported
 * (reports.ts), so it is left out of the breakdowns the list counts as unreported.
 */
export function BreakdownAlerts({ alerts }: { alerts: PlayerView["alerts"] }) {
  return (
    <>
      {alerts.gravity !== null && <GravityAlert state={alerts.gravity} />}
      <AlertList kind="equipment" total={alerts.broken - (alerts.gravity === "broken" ? 1 : 0)} reports={alerts.reports} />
    </>
  );
}

/** The Gravity Simulator's row: broken, or restarting until the next cycle change (gravity.ts). */
function GravityAlert({ state }: { state: "broken" | "restarting" }) {
  const { t } = useTranslation();
  const key = state === "broken" ? "gravityBroken" : "gravityRestarting";
  return (
    <div className="alert-gravity" data-gravity={state}>
      <strong className="alert-popup-head">
        <img src={GRAVITY_ICON} alt="" />
        {t(`shipResources.${key}`)}
      </strong>
      <p>{t(`shipResources.${key}Text`, { mp: DEFAULT_CONFIG.gravitySimulator.brokenMpPenalty })}</p>
    </div>
  );
}

/** How one of the ship's four resources is gained and lost, and what happens at 0 (rules: ship.ts and the modules it names). */
function ResourceInfo({ id }: { id: "oxygen" | "fuel" | "hull" | "plasmaShield" }) {
  // Each line is one whole sentence with its label ("Gained:", "Lost:", "At 0:") in a <b> tag, so translators keep the word order.
  const bold = { b: <strong /> };
  return (
    <ul className="alert-list resource-info">
      <li>
        <Trans i18nKey={`shipResources.info.${id}.gain`} components={bold} />
      </li>
      <li>
        <Trans i18nKey={`shipResources.info.${id}.loss`} components={bold} />
      </li>
      <li>
        <Trans i18nKey={`shipResources.info.${id}.zero`} components={bold} />
      </li>
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
