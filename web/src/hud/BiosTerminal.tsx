// The BIOS terminal's window: NERON's switches. The settings (`view.bios`) are read-only for anyone at the terminal;
// the buttons come from view.actions, which offer them only to the NERON Admin.

import { BIOS_OPTIONS, type Action, type EquipmentView, type PlayerView } from "@mush2/shared";
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
  return (
    <div className="research-list" role="group" aria-label={t("bios.label")}>
      {terminalLogin(terminal.type, view, terminal.id).access === "limited" && <p>{t("bios.adminOnly")}</p>}
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
