// The BIOS terminal's window: NERON's switches, CPU priority, and crew lock. The settings (`view.bios`) are read-only
// for anyone at the terminal; the buttons come from view.actions, which offer them only to the NERON Admin.

import { BIOS_OPTIONS, CPU_PRIORITIES, CREW_LOCKS, type Action, type EquipmentView, type PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { terminalLogin } from "./terminalUsername.ts";
import "./settings.css";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function BiosTerminal({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const settings = view.bios;
  if (!settings) return null;
  const options = BIOS_OPTIONS.map((option) => ({
    option,
    on: settings[option],
    offer: view.actions.find(({ action: a }) => a.type === "set_bios" && a.equipment === terminal.id && a.option === option),
  }));
  const cpuOffers = CPU_PRIORITIES.flatMap((value) => {
    const offer = view.actions.find(
      ({ action: a }) => a.type === "set_bios" && a.equipment === terminal.id && a.option === "cpu_priority" && a.value === value,
    );
    return offer ? [{ value, offer }] : [];
  });
  const lockOffers = CREW_LOCKS.flatMap((value) => {
    const offer = view.actions.find(
      ({ action: a }) => a.type === "set_bios" && a.equipment === terminal.id && a.option === "crew_lock" && a.value === value,
    );
    return offer ? [{ value, offer }] : [];
  });
  return (
    <div className="research-list" role="group" aria-label={t("bios.label")}>
      {terminalLogin(terminal.type, view, terminal.id).access === "limited" && <p>{t("bios.adminOnly")}</p>}
      <section className="research-item" aria-label={t("bios.cpu_priority.name")}>
        <div className="research-body">
          <strong>
            {t("bios.currentValue", {
              name: t("bios.cpu_priority.name"),
              value: t(`bios.cpu_priority.values.${settings.cpu_priority}`),
            })}
          </strong>
          <span>{t("bios.cpu_priority.desc")}</span>
        </div>
        {cpuOffers.length > 0 && (
          <div className="bios-choices">
            {cpuOffers.map(({ value, offer }) => (
              <ActionButton key={value} view={view} option={offer} onAction={onAction}>
                <ActionLabel text={t(`bios.cpu_priority.values.${value}`)} cost={offer.cost} chance={offer.chance} />
              </ActionButton>
            ))}
          </div>
        )}
      </section>
      <section className="research-item" aria-label={t("bios.crew_lock.name")}>
        <div className="research-body">
          <strong>
            {t("bios.currentValue", {
              name: t("bios.crew_lock.name"),
              value: t(`bios.crew_lock.values.${settings.crew_lock}`),
            })}
          </strong>
          <span>{t("bios.crew_lock.desc")}</span>
        </div>
        {lockOffers.length > 0 && (
          <div className="bios-choices">
            {lockOffers.map(({ value, offer }) => (
              <ActionButton key={value} view={view} option={offer} onAction={onAction}>
                <ActionLabel text={t(`bios.crew_lock.values.${value}`)} cost={offer.cost} chance={offer.chance} />
              </ActionButton>
            ))}
          </div>
        )}
      </section>
      {options.map(({ option, on, offer }) => (
        <section key={option} className="research-item" aria-label={t(`bios.${option}.name`)}>
          <div className="research-body">
            <strong>{t(on ? "bios.isOn" : "bios.isOff", { name: t(`bios.${option}.name`) })}</strong>
            <span>{t(`bios.${option}.desc`)}</span>
          </div>
          {offer && (
            <ActionButton view={view} option={offer} onAction={onAction}>
              <ActionLabel text={on ? t("bios.switchOff") : t("bios.switchOn")} cost={offer.cost} chance={offer.chance} />
            </ActionButton>
          )}
        </section>
      ))}
    </div>
  );
}
