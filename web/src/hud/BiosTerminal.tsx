// The BIOS terminal's window: NERON's switches, CPU priority, and crew lock. The settings (`view.bios`) are read-only
// for anyone at the terminal; the buttons come from view.actions, which offer them only to the NERON Admin.

import { Popover } from "@base-ui/react/popover";
import { BIOS_OPTIONS, CPU_PRIORITIES, CREW_LOCKS, type Action, type ActionOption, type EquipmentView, type PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { ActionButton } from "./ActionButton.tsx";
import { terminalLogin } from "./terminalUsername.ts";
import "./settings.css";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
}

/** A BIOS setting's title: hovering, focusing, or tapping opens its description in a tooltip card. */
function SettingTitle({ name, desc }: { name: string; desc: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} nativeButton={false} render={<strong />} className="has-tip">
        {name}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card">
            <strong>{name}</strong>
            <p>{desc}</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A radio group for a multi-choice BIOS setting (CPU priority, crew lock). */
function BiosRadioGroup({
  name,
  desc,
  choices,
  view,
  onAction,
}: {
  name: string;
  desc: string;
  choices: { value: string; label: string; selected: boolean; offer: ActionOption | undefined }[];
  view: PlayerView;
  onAction: (action: Action) => void;
}) {
  return (
    <section className="research-item" aria-label={name}>
      <div className="research-body">
        <SettingTitle name={name} desc={desc} />
      </div>
      <div className="bios-choices" role="radiogroup" aria-label={name}>
        {choices.map(({ value, label, selected, offer }) =>
          selected ? (
            <button key={value} type="button" role="radio" aria-checked="true" className="bios-radio">
              {label}
            </button>
          ) : offer ? (
            <ActionButton
              key={value}
              view={view}
              option={offer}
              onAction={onAction}
              className="bios-radio"
              singlePress
              radioProps={{ checked: false }}
            >
              {label}
            </ActionButton>
          ) : (
            <button key={value} type="button" role="radio" aria-checked="false" className="bios-radio" disabled>
              {label}
            </button>
          ),
        )}
      </div>
    </section>
  );
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
  const cpuChoices = CPU_PRIORITIES.filter((value) => value !== "none").map((value) => ({
    value,
    label: t(`bios.cpu_priority.values.${value}`),
    selected: settings.cpu_priority === value,
    offer: view.actions.find(
      ({ action: a }) => a.type === "set_bios" && a.equipment === terminal.id && a.option === "cpu_priority" && a.value === value,
    ),
  }));
  const lockChoices = CREW_LOCKS.map((value) => ({
    value,
    label: t(`bios.crew_lock.values.${value}`),
    selected: settings.crew_lock === value,
    offer: view.actions.find(
      ({ action: a }) => a.type === "set_bios" && a.equipment === terminal.id && a.option === "crew_lock" && a.value === value,
    ),
  }));
  return (
    <div className="research-list" role="group" aria-label={t("bios.label")}>
      {terminalLogin(terminal.type, view, terminal.id).access === "limited" && <p>{t("bios.adminOnly")}</p>}
      <BiosRadioGroup
        name={t("bios.cpu_priority.name")}
        desc={t("bios.cpu_priority.desc")}
        choices={cpuChoices}
        view={view}
        onAction={onAction}
      />
      <BiosRadioGroup
        name={t("bios.crew_lock.name")}
        desc={t("bios.crew_lock.desc")}
        choices={lockChoices}
        view={view}
        onAction={onAction}
      />
      {options.map(({ option, on, offer }) => {
        const name = t(`bios.${option}.name`);
        return (
          <section key={option} className="research-item bios-toggle-row" aria-label={name}>
            <SettingTitle name={name} desc={t(`bios.${option}.desc`)} />
            {offer ? (
              <ActionButton
                view={view}
                option={offer}
                onAction={onAction}
                className="bios-switch"
                singlePress
                switchProps={{ checked: on, label: name }}
              />
            ) : (
              <button type="button" role="switch" aria-checked={on} aria-label={name} className="bios-switch" disabled />
            )}
          </section>
        );
      })}
    </div>
  );
}
