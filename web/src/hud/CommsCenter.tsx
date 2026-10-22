// The Com center terminal's window: the link with Sol, the rebel bases that called, Xyloph and NERON's update. The
// screen (`view.comms.terminal`) is read-only for anyone at the terminal; every button comes from view.actions.

import type { Action, EquipmentView, PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import "./settings.css";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function CommsCenter({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  const screen = view.comms.terminal;
  const find = (type: Action["type"], base?: string) =>
    view.actions.find(({ action: a }) => a.type === type && "equipment" in a && a.equipment === terminal.id && (base === undefined || ("base" in a && a.base === base)));
  const contactSol = find("contact_sol");
  const xyloph = find("contact_xyloph");
  const neron = find("update_neron");
  const officer = view.titles.find((title) => title.id === "comms_officer")?.holder === view.you.character;
  if (!screen) return null;
  return (
    <div className="research-list">
      <section className="research-item" aria-label={t("actions.contactSol")}>
        <div className="research-body">
          <strong>{view.comms.linked ? t("comms.linked") : t("comms.unlinked")}</strong>
          <span>{t("comms.solChance", { percent: screen.solChance })}</span>
          {!view.comms.linked ? <span>{t("comms.linkNeeded")}</span> : !officer && <span>{t("comms.officerOnly")}</span>}
        </div>
        {contactSol && (
          <ActionButton view={view} option={contactSol} onAction={onAction}>
            <ActionLabel text={t("actions.contactSol")} cost={contactSol.cost} chance={contactSol.chance} />
          </ActionButton>
        )}
      </section>

      <section aria-label={t("comms.rebelsTitle")}>
        <h3>{t("comms.rebelsTitle")}</h3>
        {screen.rebels.length === 0 && <p>{t("comms.noRebels")}</p>}
        <ul className="research-list">
          {screen.rebels.map((call) => {
            const decode = find("decode_rebel", call.base);
            return (
              <li key={call.base} className="research-item">
                <div className="research-body">
                  <strong>{names.rebelBase(call.base)}</strong>
                  <span>{t(`comms.rebels.${call.base}.effect`)}</span>
                  <progress max={100} value={call.progress} />
                  <span>
                    {call.status === "contacted"
                      ? t("comms.rebelContacted")
                      : call.status === "lost"
                        ? t("comms.rebelLost")
                        : t("comms.rebelOpen", { percent: call.progress, count: call.expiresAt - view.cycle })}
                  </span>
                </div>
                {decode && (
                  <ActionButton view={view} option={decode} onAction={onAction}>
                    <ActionLabel text={t("actions.decodeRebel")} cost={decode.cost} chance={decode.chance} />
                  </ActionButton>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="research-item" aria-label={t("comms.xylophTitle")}>
        <div className="research-body">
          <strong>{t("comms.xylophTitle")}</strong>
          <span>{t("comms.xylophDesc")}</span>
          <span>{screen.xylophLeft > 0 ? t("comms.xylophLeft", { count: screen.xylophLeft }) : t("comms.xylophDone")}</span>
        </div>
        {xyloph && (
          <ActionButton view={view} option={xyloph} onAction={onAction}>
            <ActionLabel text={t("actions.contactXyloph")} cost={xyloph.cost} chance={xyloph.chance} />
          </ActionButton>
        )}
      </section>

      <section className="research-item" aria-label={t("comms.neronTitle")}>
        <div className="research-body">
          <strong>{t("comms.neronVersion", { version: screen.neron.version })}</strong>
          <progress max={100} value={screen.neron.progress} />
          <span>{t("comms.neronProgress", { percent: screen.neron.progress })}</span>
        </div>
        {neron && (
          <ActionButton view={view} option={neron} onAction={onAction}>
            <ActionLabel text={t("actions.updateNeron")} cost={neron.cost} chance={neron.chance} />
          </ActionButton>
        )}
      </section>
    </div>
  );
}
