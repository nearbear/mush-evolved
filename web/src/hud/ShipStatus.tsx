// Where the ship is (owner, 2026-11-20), part of the game state, so joined to the clock's amber plate past a divider:
// pre-selection until the Mush are chosen, then in orbit around a planet, exploring it while an expedition is away, or
// deep space (most of the game). Each has a popover saying what it means and what to do next. Orbiting and exploring
// lead with the planet icon; exploring ends with the countdown to the return in the clock's fixed-width digits, and its
// popover shows the crew. All public: the orbited planet's name (owner, 2026-10-31) and the expedition (2026-11-07).
// Phones show it as its own plate under your name on the nameplate, as the clock alone fills the band there.

import { Popover } from "@base-ui/react/popover";
import type { PlayerView } from "@mush2/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SHIP_STATUS_PLANET_ICON, standingSprite } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { ClockDigits } from "./CycleCountdown.tsx";
import { useCountdown } from "./useCountdown.ts";

interface Props {
  preselection: boolean;
  /** The orbited planet's name (`navigation.orbitName`), or null out of orbit. */
  orbit: string | null;
  expedition: PlayerView["expedition"];
  /** Inside the clock's plate, past a divider (desktop), rather than a plate of its own (phones). */
  joined?: boolean;
}

export function ShipStatus({ preselection, orbit, expedition, joined = false }: Props) {
  const planet = orbit ?? expedition?.planet ?? null;
  const content = preselection ? <Preselection /> : planet !== null ? <AtPlanet planet={planet} expedition={expedition} /> : <DeepSpace />;
  return joined ? (
    <>
      <span className="clock-divider" aria-hidden="true" />
      <span className="ship-status">{content}</span>
    </>
  ) : (
    <span className="ship-status hud-card amber">{content}</span>
  );
}

/** A status with its explanation in a popover, opened by hover, focus or tap. */
function StatusPopover({ label, trigger, children }: { label?: string | undefined; trigger: ReactNode; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} nativeButton={false} render={<span role="button" tabIndex={0} />} className="ship-status-trigger" aria-label={label}>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card ship-status-popup">{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Preselection() {
  const { t } = useTranslation();
  return (
    <StatusPopover trigger={t("topBar.preselection")}>
      <strong>{t("topBar.preselection")}</strong>
      <p>{t("topBar.preselectionAbout")}</p>
    </StatusPopover>
  );
}

/** After pre-selection, out of orbit: most of the game. Says how to find a planet and get there. */
function DeepSpace() {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <StatusPopover trigger={t("topBar.deepSpace")}>
      <strong>{t("topBar.deepSpace")}</strong>
      <p>{t("topBar.deepSpaceAbout", { astro: names.equipment("ASTRO_MODULE"), command: names.equipment("PILOT_MODULE") })}</p>
    </StatusPopover>
  );
}

/**
 * Orbiting or exploring: the planet icon and the status, then while exploring the return countdown, all one trigger.
 * Its accessible name is the status as a sentence (where, who, when back), so what it shows is hidden from screen
 * readers. The popover names the planet, says what to do, and while exploring shows the crew's sprites over their
 * given names.
 */
function AtPlanet({ planet, expedition }: { planet: string; expedition: PlayerView["expedition"] }) {
  const { t } = useTranslation();
  const names = useNames();
  const label = useExpeditionLabel(expedition);
  return (
    <StatusPopover
      label={label ?? t("shipResources.orbit", { name: planet })}
      trigger={
        <>
          <img src={SHIP_STATUS_PLANET_ICON} alt="" />
          <span>{t(expedition ? "topBar.exploring" : "topBar.orbiting")}</span>
          {expedition && <ReturnClock at={expedition.returnAt} />}
        </>
      }
    >
      <strong>{planet}</strong>
      <p>{expedition ? t("topBar.exploringAbout") : t("topBar.orbitingAbout", { bay: names.room("ICARUS") })}</p>
      {expedition && (
        <ul className="expedition-crew">
          {expedition.crew.map((c) => (
            <li key={c}>
              <span style={standingSprite(c, 1)} aria-hidden="true" />
              <span>{names.characterGiven(c)}</span>
            </li>
          ))}
        </ul>
      )}
    </StatusPopover>
  );
}

/** Where the expedition is, who is on it and when they are back, as one sentence; null with no expedition away. */
function useExpeditionLabel(expedition: PlayerView["expedition"]): string | null {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const time = useCountdown(expedition?.returnAt ?? 0);
  if (!expedition) return null;
  const crew = new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(expedition.crew.map((c) => names.characterGiven(c)));
  return expedition.ship !== undefined
    ? t("shipResources.expeditionShip", { planet: expedition.planet, ship: names.room(expedition.ship), names: crew, time })
    : t("shipResources.expedition", { planet: expedition.planet, names: crew, time });
}

function ReturnClock({ at }: { at: number }) {
  return (
    <>
      <span className="clock-divider" aria-hidden="true" />
      <span className="cycle-countdown" aria-hidden="true">
        <ClockDigits time={useCountdown(at)} />
      </span>
    </>
  );
}
