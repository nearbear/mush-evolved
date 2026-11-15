// The Com center terminal's window, in three tabs: Overview (the link with Sol, drawn as a spectrogram, and NERON's update), Xyloph, and the
// rebel bases that called. The screen (`view.comms.terminal`) is read-only for anyone at the terminal; every button comes from view.actions.

import { Tabs } from "@base-ui/react/tabs";
import { Tooltip } from "@base-ui/react/tooltip";
import { type Action, type EquipmentView, type PlayerView, XYLOPH_IDS } from "@mush2/shared";
import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { CHECK_ICON, REBEL_BASE_ICONS, UNCHECK_ICON, XYLOPH_DONE, XYLOPH_TODO } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { UnavailableButton } from "./CommandTerminal.tsx";
import { signalStrength, solDb, Spectrogram } from "./Spectrogram.tsx";
import "./settings.css";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
}

type CommsTab = "overview" | "xyloph" | "rebels";

export function CommsCenter({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  const [tab, setTab] = useState<CommsTab>("overview");
  const screen = view.comms.terminal;
  const find = (type: Action["type"], base?: string) =>
    view.actions.find(({ action: a }) => a.type === type && "equipment" in a && a.equipment === terminal.id && (base === undefined || ("base" in a && a.base === base)));
  const contactSol = find("contact_sol");
  const xyloph = find("contact_xyloph");
  const neron = find("update_neron");
  const officer = view.titles.find((title) => title.id === "comms_officer")?.holder === view.you.character;
  if (!screen) return null;
  const db = solDb(screen.solChance);
  return (
    <Tabs.Root className="settings-tabs" value={tab} onValueChange={(value) => setTab(value as CommsTab)}>
      <Tabs.List className="settings-tab-list progress-tab-list" aria-label={names.equipment(terminal.type)}>
        <Tabs.Tab className="settings-tab" value="overview">{t("comms.overviewTitle")}</Tabs.Tab>
        <Tabs.Tab className="settings-tab" value="xyloph">{t("comms.xylophTitle")}</Tabs.Tab>
        <Tabs.Tab className="settings-tab" value="rebels">{t("comms.rebelsTitle")}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview">
        <div className="research-list">
          <section className="research-item comms-sol" aria-label={t("actions.contactSol")}>
            {contactSol && (
              <ActionButton className="big comms-sol-contact" view={view} option={contactSol} onAction={onAction}>
                <ActionLabel text={t("actions.contactSol")} cost={contactSol.cost} chance={contactSol.chance} />
              </ActionButton>
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
              <strong>{t("comms.neronVersion", { version: screen.neron.version })}</strong>
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
                <span>{t("research.percent", { percent: screen.neron.progress })}</span>
                {neron && (
                  <ActionButton view={view} option={neron} onAction={onAction}>
                    <ActionLabel text={t("actions.updateNeron")} cost={neron.cost} chance={neron.chance} />
                  </ActionButton>
                )}
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
      <Tabs.Panel value="rebels">
          <section aria-label={t("comms.rebelsTitle")}>
            {screen.rebels.length === 0 && <p>{t("comms.noRebels")}</p>}
            <ul className="research-list">
              {screen.rebels.map((call) => {
                const decode = find("decode_rebel", call.base);
                const status = t(
                  call.status === "contacted" ? "comms.rebelStatusDecoded" : call.status === "lost" ? "comms.rebelStatusLost" : "comms.rebelStatusOpen",
                );
                const effect = t(`comms.rebels.${call.base}.effect`);
                return (
                  <li key={call.base} className="research-item">
                    <Tooltip.Provider delay={300}>
                      <Tooltip.Root>
                        <Tooltip.Trigger
                          className="research-card rebel-icon rebel-icon-button"
                          aria-label={`${names.rebelBase(call.base)}. ${effect}`}
                          render={<button type="button" />}
                        >
                          <img src={REBEL_BASE_ICONS[call.base]} alt="" />
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Positioner sideOffset={6}>
                            <Tooltip.Popup className="tooltip">
                              <p>{effect}</p>
                              {call.status === "open" && <p>{t("comms.rebelOpen", { percent: call.progress, count: call.expiresAt - view.cycle })}</p>}
                            </Tooltip.Popup>
                          </Tooltip.Positioner>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                    <div className="research-title">
                      <strong>{names.rebelBase(call.base)}</strong>
                      <span className="rebel-status">{status}</span>
                      {call.status === "contacted" ? (
                        <img src={CHECK_ICON} alt="" />
                      ) : call.status === "lost" ? (
                        <span className="rebel-lost" />
                      ) : (
                        <img src={UNCHECK_ICON} alt="" />
                      )}
                    </div>
                    <div className="research-body">
                      <div className="research-progress">
                        <div className="kit-progress neron" role="progressbar" aria-label={names.rebelBase(call.base)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={call.progress} style={{ "--value": call.progress / 100 } as CSSProperties} />
                        <span>{t("research.percent", { percent: call.progress })}</span>
                        {decode && (
                          <ActionButton view={view} option={decode} onAction={onAction}>
                            <ActionLabel text={t("actions.decodeRebel")} cost={decode.cost} chance={decode.chance} />
                          </ActionButton>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            {screen.nextRebel && (
              <li className="research-item">
              <Tooltip.Provider delay={300}>
                <>
                  <Tooltip.Root>
                    <Tooltip.Trigger
                      className="research-card rebel-icon rebel-icon-button"
                      aria-label={t("comms.rebelNext", { base: names.rebelBase(screen.nextRebel.base), count: screen.nextRebel.at - view.cycle })}
                      render={<button type="button" />}
                    >
                      <img src={REBEL_BASE_ICONS[screen.nextRebel.base]} alt="" />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Positioner sideOffset={6}>
                        <Tooltip.Popup className="tooltip">{t("comms.rebelNextIn", { count: screen.nextRebel.at - view.cycle })}</Tooltip.Popup>
                      </Tooltip.Positioner>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                  <div className="research-title">
                    <strong>{names.rebelBase(screen.nextRebel.base)}</strong>
                    <span className="rebel-status">{t("comms.rebelUpcoming")}</span>
                  </div>
                </>
              </Tooltip.Provider>
              </li>
            )}
            </ul>
          </section>
      </Tabs.Panel>
    </Tabs.Root>
  );
}
