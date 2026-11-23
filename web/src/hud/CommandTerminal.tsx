// The Command terminal's window, in two tabs: Interplanetary (steering, ShipNavigation.tsx) and Intergalactic (the three
// launch keys, then the ways to end the trip: Sol and Eden, actions/travel_to_eden.ts). A switch or destination the view
// doesn't offer is shown greyed out, with the reason on hover, focus or tap.

import { Popover } from "@base-ui/react/popover";
import { Tabs } from "@base-ui/react/tabs";
import { TITLE_IDS, type Action, type EquipmentView, type PlayerView, type TitleId } from "@mush2/shared";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { ConfirmPanel } from "./ConfirmPanel.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { ShipNavigation } from "./ShipNavigation.tsx";
import { TerminalCollapsible } from "./TerminalCollapsible.tsx";
import { terminalLogin } from "./terminalUsername.ts";
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
        <TravelBasics />
        <ShipNavigation terminal={terminal} view={view} onAction={onAction} />
      </Tabs.Panel>
      <Tabs.Panel value="intergalactic">
        <Intergalactic terminal={terminal} view={view} onAction={onAction} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

/** A collapsed primer on how a jump works, as the Hydroponics terminal's botany basics (owner, 2026-11-22). Static text only. */
function TravelBasics() {
  const { t } = useTranslation();
  return (
    <TerminalCollapsible heading={t("command.basicsHeading")}>
      <p>{t("command.basicsPlanets")}</p>
      <p>{t("command.basicsFuel")}</p>
      <p>{t("command.basicsSteer")}</p>
      <p>{t("command.basicsArrive")}</p>
    </TerminalCollapsible>
  );
}

function Intergalactic({ terminal, view, onAction }: Props) {
  return (
    <>
      <LaunchKeys terminal={terminal} view={view} onAction={onAction} />
      <div className="command-destinations">
        <ReturnToSol terminal={terminal} view={view} onAction={onAction} />
        <TravelToEden terminal={terminal} view={view} onAction={onAction} />
      </div>
    </>
  );
}

/** Whether all three launch keys are in, as far as this view shows (only on the bridge, `view.launchKeys`). */
const allKeysIn = (view: PlayerView) => view.launchKeys !== null && TITLE_IDS.every((id) => view.launchKeys![id]);

/**
 * The three launch keys (#480), one vertical switch per title: up is in. Only that title's holder flips theirs, for free
 * and with one press (the view offers `set_launch_key` only to them); anyone else sees it greyed out with why.
 */
function LaunchKeys({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const headingId = useId();
  const keys = view.launchKeys;
  if (!keys) return null;
  return (
    <section className="launch-keys" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("command.keysHeading")}</h3>
      <p className="sub">{t("command.keysHelp")}</p>
      <ul className="launch-key-list">
        {TITLE_IDS.map((id) => (
          <LaunchKey key={id} titleId={id} on={keys[id]} terminal={terminal} view={view} onAction={onAction} />
        ))}
      </ul>
    </section>
  );
}

function LaunchKey({ titleId: title, on, terminal, view, onAction }: Props & { titleId: TitleId; on: boolean }) {
  const { t } = useTranslation();
  const names = useNames();
  const titleName = names.title(title);
  const label = t("command.keyLabel", { title: titleName });
  const offer = view.actions.find(({ action: a }) => a.type === "set_launch_key" && a.equipment === terminal.id && a.title === title);
  const holder = view.titles.find((entry) => entry.id === title)?.holder ?? null;
  const reason = terminal.broken
    ? t("command.keyBroken")
    : view.launched !== null
      ? t("actions.lacksTravelUnderway")
      : holder !== view.you.character
        ? t("command.keyHolderOnly", { title: titleName })
        : t("command.keyUnavailable");
  return (
    <li className="launch-key">
      <div className="launch-key-slot">
        {offer ? (
          <ActionButton view={view} option={offer} onAction={onAction} className="bios-switch" singlePress switchProps={{ checked: on, label }} />
        ) : (
          <Popover.Root>
            <Popover.Trigger
              openOnHover
              delay={200}
              className="bios-switch action-disabled"
              aria-disabled="true"
              render={<button type="button" role="switch" aria-checked={on} aria-label={label} />}
            />
            <Popover.Portal>
              <Popover.Positioner sideOffset={6}>
                <Popover.Popup className="tooltip resource-card status-card">{reason}</Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
      <span className="launch-key-name">{titleName}</span>
      <span className="launch-key-state">{on ? t("command.keyIn") : t("command.keyOut")}</span>
    </li>
  );
}

/**
 * The way home: offered by the view only to the Commander once PILGRED is repaired and all three launch keys are in. It ends the game, so the button asks
 * for confirmation first (owner, 2026-10-21). When it isn't offered it is greyed out and says why, from what the view
 * already shows everyone (the titles, and whether PILGRED is repaired, which is announced to the whole crew).
 */
function ReturnToSol({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const option = view.actions.find(({ action: a }) => a.type === "return_to_sol" && a.equipment === terminal.id);
  const commander = terminalLogin(terminal.type, view, terminal.id).access !== "limited";
  return (
    option ? (
      <>
        <ActionButton className="big" view={view} option={option} onAction={() => setConfirming(true)}>
          <ActionLabel text={t("actions.returnToSol")} cost={option.cost} chance={option.chance} />
        </ActionButton>
        <ConfirmPanel
          open={confirming}
          onOpenChange={setConfirming}
          message={t("returnToSol.confirm")}
          yesLabel={t("returnToSol.confirmYes")}
          backLabel={t("returnToSol.back")}
          onYes={() => {
            onAction(option.action);
            setConfirming(false);
          }}
        />
      </>
    ) : (
      <UnavailableButton reason={view.launched !== null ? t("actions.lacksTravelUnderway") : !view.pilgredRepaired ? t("command.solPilgredBroken") : !allKeysIn(view) ? t("command.keysMissing") : commander ? t("command.solNotReady") : t("command.solCommanderOnly")} ap={view.config.returnToSolAp}>
        {t("actions.returnToSol")}
      </UnavailableButton>
    )
  );
}

/**
 * The trip to Eden (#478): offered once Eden is computed, PILGRED is repaired and all three keys are in, with the Commander's access. It ends
 * the game, so it asks for confirmation as Return to Sol does; otherwise greyed out with why, from public state.
 */
function TravelToEden({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const option = view.actions.find(({ action: a }) => a.type === "travel_to_eden" && a.equipment === terminal.id);
  const commander = terminalLogin(terminal.type, view, terminal.id).access !== "limited";
  if (!option) {
    const reason = view.launched !== null ? t("actions.lacksTravelUnderway") : !view.edenComputed ? t("command.edenNotComputed") : !view.pilgredRepaired ? t("command.solPilgredBroken") : !allKeysIn(view) ? t("command.keysMissing") : commander ? t("command.solNotReady") : t("command.edenCommanderOnly");
    return <UnavailableButton reason={reason} ap={view.config.edenAp}>{t("actions.travelToEden")}</UnavailableButton>;
  }
  return (
    <>
      <ActionButton className="big" view={view} option={option} onAction={() => setConfirming(true)}>
        <ActionLabel text={t("actions.travelToEden")} cost={option.cost} chance={option.chance} />
      </ActionButton>
      <ConfirmPanel
        open={confirming}
        onOpenChange={setConfirming}
        message={t("command.edenConfirm")}
        yesLabel={t("actions.travelToEden")}
        backLabel={t("returnToSol.back")}
        onYes={() => {
          onAction(option.action);
          setConfirming(false);
        }}
      />
    </>
  );
}

/** A greyed-out button for something that can't be done right now, with the reason on hover, focus or tap (as DisabledActionButton). */
export function UnavailableButton({ reason, ap, children, className, big = true }: { reason: string; ap: number; children: string; className?: string; big?: boolean }) {
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className={`${big ? "big " : ""}action-disabled${className ? ` ${className}` : ""}`} aria-disabled="true" render={<button type="button" />}>
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
