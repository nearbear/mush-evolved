// The Command terminal's window, in two tabs: Interplanetary (steering, ShipNavigation.tsx) and Intergalactic (the ways to end
// the trip: Sol and Eden). A destination the view doesn't offer is shown greyed out, with the reason on hover, focus or tap.

import { Popover } from "@base-ui/react/popover";
import { Tabs } from "@base-ui/react/tabs";
import type { Action, EquipmentView, PlayerView } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { ShipNavigation } from "./ShipNavigation.tsx";
import "./settings.css";
import "./terminal.css";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
}

type CommandTab = "navigation" | "intergalactic";

export function CommandTerminal({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CommandTab>("navigation");
  return (
    <Tabs.Root className="settings-tabs" value={tab} onValueChange={(value) => setTab(value as CommandTab)}>
      <Tabs.List className="settings-tab-list progress-tab-list" aria-label={t("command.tabs")}>
        <Tabs.Tab className="settings-tab" value="navigation">{t("command.navigationTab")}</Tabs.Tab>
        <Tabs.Tab className="settings-tab" value="intergalactic">{t("command.intergalacticTab")}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="navigation">
        <ShipNavigation terminal={terminal} view={view} onAction={onAction} />
      </Tabs.Panel>
      <Tabs.Panel value="intergalactic">
        <Intergalactic terminal={terminal} view={view} onAction={onAction} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function Intergalactic({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  return (
    <div className="command-destinations">
      <ReturnToSol terminal={terminal} view={view} onAction={onAction} />
      <UnavailableButton reason={t("command.edenUnavailable")} ap={view.config.edenAp}>{t("actions.travelToEden")}</UnavailableButton>
    </div>
  );
}

/**
 * The way home: offered by the view only to the Commander once PILGRED is repaired. It ends the game, so the button asks
 * for confirmation first (owner, 2026-10-21). When it isn't offered it is greyed out and says why, from what the view
 * already shows everyone (the titles, and whether PILGRED is repaired, which is announced to the whole crew).
 */
function ReturnToSol({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const option = view.actions.find(({ action: a }) => a.type === "return_to_sol" && a.equipment === terminal.id);
  if (confirming && option) {
    return (
      <div className="skill-confirm">
        <p>{t("returnToSol.confirm")}</p>
        <div className="skill-confirm-buttons">
          <button type="button" onClick={() => setConfirming(false)}>
            {t("returnToSol.back")}
          </button>
          <button
            type="button"
            onClick={() => {
              onAction(option.action);
              setConfirming(false);
            }}
          >
            {t("returnToSol.confirmYes")}
          </button>
        </div>
      </div>
    );
  }
  const commander = view.titles.find((title) => title.id === "commander")?.holder === view.you.character;
  return (
    option ? (
      <ActionButton className="big" view={view} option={option} onAction={() => setConfirming(true)}>
        <ActionLabel text={t("actions.returnToSol")} cost={option.cost} chance={option.chance} />
      </ActionButton>
    ) : (
      <UnavailableButton reason={!view.pilgredRepaired ? t("command.solPilgredBroken") : commander ? t("command.solNotReady") : t("command.solCommanderOnly")} ap={view.config.returnToSolAp}>
        {t("actions.returnToSol")}
      </UnavailableButton>
    )
  );
}

/** A greyed-out button for something that can't be done right now, with the reason on hover, focus or tap (as DisabledActionButton). */
export function UnavailableButton({ reason, ap, children, className }: { reason: string; ap: number; children: string; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className={`big action-disabled${className ? ` ${className}` : ""}`} aria-disabled="true" render={<button type="button" />}>
        <ActionLabel text={children} cost={{ ap, mp: 0 }} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card status-card">{reason}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
