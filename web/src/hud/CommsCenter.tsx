// The Com center terminal's window, in three tabs: Overview (the link with Sol, drawn as a spectrogram, and NERON's
// update), Xyloph, and Signals (Signals.tsx: every merchant ship and rebel base that reached the Daedalus and its
// conversation, Comms Officer access only; docs/plans/signals.md). The screen (`view.comms.terminal`) is read-only for
// anyone at the terminal; every button comes from view.actions.

import { Tabs } from "@base-ui/react/tabs";
import { Tooltip } from "@base-ui/react/tooltip";
import { type Action, type EquipmentView, isActiveSignal, type PlayerView, XYLOPH_IDS } from "@mush2/shared";
import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { XYLOPH_DONE, XYLOPH_TODO } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { UnavailableButton } from "./CommandTerminal.tsx";
import { Signals } from "./Signals.tsx";
import { signalStrength, solDb, Spectrogram } from "./Spectrogram.tsx";
import { terminalLogin } from "./terminalUsername.ts";
import "./settings.css";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
  /** The tab and the signal's conversation it opens on (the design kit's Signals figures); the game opens on Overview. */
  initialTab?: CommsTab;
  initialSignal?: string;
}

type CommsTab = "overview" | "xyloph" | "signals";

export function CommsCenter({ terminal, view, onAction, initialTab = "overview", initialSignal }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  const [tab, setTab] = useState<CommsTab>(initialTab);
  const screen = view.comms.terminal;
  const find = (type: Action["type"]) => view.actions.find(({ action: a }) => a.type === type && "equipment" in a && a.equipment === terminal.id);
  const contactSol = find("contact_sol");
  const xyloph = find("contact_xyloph");
  const neron = find("update_neron");
  const officer = terminalLogin(terminal.type, view, terminal.id).access !== "limited";
  if (!screen) return null;
  const db = solDb(screen.solChance);
  return (
    <Tabs.Root className="settings-tabs" value={tab} onValueChange={(value) => setTab(value as CommsTab)}>
      <Tabs.List className="settings-tab-list progress-tab-list comms-tab-list" aria-label={names.equipment(terminal.type)}>
        <Tabs.Tab className="settings-tab" value="overview">{t("comms.overviewTitle")}</Tabs.Tab>
        <Tabs.Tab className="settings-tab" value="xyloph">{t("comms.xylophTitle")}</Tabs.Tab>
        <Tabs.Tab className="settings-tab" value="signals">{t("signals.tab", { count: screen.signals?.filter(isActiveSignal).length ?? 0 })}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview">
        <div className="research-list">
          <section className="research-item comms-sol" aria-label={t("actions.contactSol")}>
            {contactSol ? (
              <ActionButton className="big comms-sol-contact" view={view} option={contactSol} onAction={onAction}>
                <ActionLabel text={t("actions.contactSol")} cost={contactSol.cost} chance={contactSol.chance} />
              </ActionButton>
            ) : (
              <UnavailableButton
                className="comms-sol-contact"
                reason={view.comms.linked ? t("comms.solAlreadyLinked") : t("comms.solUnavailable")}
                ap={view.config.contactSolAp}
              >
                {t("actions.contactSol")}
              </UnavailableButton>
            )}
            <Spectrogram
              db={db}
              linked={view.comms.linked}
              status={view.comms.linked ? t("comms.linked") : t("comms.unlinked")}
              signal={t("comms.solSignal", { db, strength: t(`comms.strength.${signalStrength(db)}`) })}
            />
            {!view.comms.linked ? <span className="sub">{t("comms.linkNeeded")}</span> : !officer && <span className="sub">{t("comms.officerOnly")}</span>}
          </section>

          <section className="research-item" aria-label={t("comms.neronTitle")}>
            <div className="research-body">
              <div className="research-title">
                <strong>{t("comms.neronVersion", { version: screen.neron.version })}</strong>
                {neron && (
                  <ActionButton view={view} option={neron} onAction={onAction}>
                    <ActionLabel text={t("comms.neronUpgrade")} cost={neron.cost} chance={neron.chance} />
                  </ActionButton>
                )}
              </div>
              <div className="research-progress">
                <div
                  className="kit-progress neron"
                  role="progressbar"
                  aria-label={t("comms.neronTitle")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={screen.neron.progress}
                  style={{ "--value": screen.neron.progress / 100 } as CSSProperties}
                />
              </div>
              <span className="sub">{t("comms.neronProgress", { percent: screen.neron.progress })}</span>
            </div>
          </section>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="xyloph">
        <div className="research-list">
          <section className="research-item" aria-label={t("comms.xylophTitle")}>
            <div className="research-body">
              {xyloph ? (
                <ActionButton className="big xyloph-contact" view={view} option={xyloph} onAction={onAction}>
                  <ActionLabel text={t("actions.contactXyloph")} cost={xyloph.cost} chance={xyloph.chance} />
                </ActionButton>
              ) : (
                <UnavailableButton
                  className="xyloph-contact"
                  reason={screen.xylophLeft === 0 ? t("comms.xylophAllFound", { count: XYLOPH_IDS.length }) : !view.comms.linked ? t("comms.xylophLinkNeeded") : !officer ? t("comms.officerOnly") : t("comms.xylophUnavailable")}
                  ap={view.config.xylophAp}
                >
                  {t("actions.contactXyloph")}
                </UnavailableButton>
              )}
              <Tooltip.Provider delay={300}>
                <ul className="xyloph-grid" aria-label={t("comms.xylophTitle")}>
                  {XYLOPH_IDS.map((id) => {
                    const found = screen.xylophFound.includes(id);
                    const text = found ? t(`comms.xyloph.${id}`) : t("comms.xylophUndeciphered");
                    return (
                      <li key={id}>
                        <Tooltip.Root>
                          <Tooltip.Trigger className="xyloph-cell" aria-label={text} render={<button type="button" />}>
                            <img src={found ? XYLOPH_DONE : XYLOPH_TODO} alt="" />
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Positioner sideOffset={6}>
                              <Tooltip.Popup className="tooltip">{text}</Tooltip.Popup>
                            </Tooltip.Positioner>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      </li>
                    );
                  })}
                </ul>
              </Tooltip.Provider>
            </div>
          </section>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="signals" className="signals-panel">
        <section className="signals-section" aria-label={t("signals.title")}>
          <Signals signals={screen.signals} nextRebel={screen.nextRebel} terminalId={terminal.id} view={view} onAction={onAction} initialOpen={initialSignal} />
        </section>
      </Tabs.Panel>
    </Tabs.Root>
  );
}
