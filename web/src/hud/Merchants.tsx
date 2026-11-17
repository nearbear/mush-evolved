// The Com center terminal's Merchants tab (#143): each merchant ship in orbit, its Contact button, then its hail, its
// deals and No thank you. Only a player with Comms Officer access gets the signals (`view.comms.terminal.signals`,
// signals.ts); anyone else sees one line. Every button is an option from view.actions (`contact_signal`, `close_deal`,
// `refuse_signal`); a deal without an option is drawn disabled, with the reason the rules give (`blocked`).
// Interim: docs/plans/signals.md replaces this tab with the Signals tab (list, conversation view, audio wave).

import { type Action, type ActionOption, type PlayerView, type SignalView, isActiveSignal } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { UnavailableButton } from "./CommandTerminal.tsx";

type Deal = NonNullable<SignalView["merchant"]>["deals"][number];
type Asset = Deal["give"][number] | Deal["receive"][number];

interface Props {
  signals: SignalView[] | undefined;
  terminalId: string;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function Merchants({ signals, terminalId, view, onAction }: Props) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  if (!signals) return <p>{t("comms.merchants.accessOnly")}</p>;
  const merchants = signals.filter((s) => s.kind === "merchant" && isActiveSignal(s));
  if (merchants.length === 0) return <p>{t("comms.merchants.none")}</p>;
  const list = (parts: string[]) => new Intl.ListFormat(i18n.language, { type: "unit" }).format(parts);
  const asset = (a: Asset) =>
    a.kind === "item"
      ? t("comms.merchants.item", { count: a.count, item: names.item(a.item) })
      : a.kind === "crew"
        ? t("comms.merchants.crew", { count: a.count })
        : a.kind === "oxygen"
          ? t("comms.merchants.oxygen", { count: a.count })
          : t("comms.merchants.fuel", { count: a.count });
  const option = (signal: string, deal: number): ActionOption | undefined =>
    view.actions.find(({ action: a }) => a.type === "close_deal" && a.equipment === terminalId && a.signal === signal && a.deal === deal);
  const signalOption = (type: "contact_signal" | "refuse_signal", signal: string): ActionOption | undefined =>
    view.actions.find(({ action: a }) => a.type === type && a.equipment === terminalId && a.signal === signal);
  const reason = (deal: Deal) => {
    switch (deal.blocked) {
      case "skill":
        return t("comms.merchants.blocked.skill", { skill: names.skill(deal.skill ?? "") });
      case "item": {
        const item = deal.give.find((a) => a.kind === "item");
        return t("comms.merchants.blocked.item", { item: item?.kind === "item" ? names.item(item.item) : "" });
      }
      case "crew":
      case "oxygen":
      case "fuel":
        return t(`comms.merchants.blocked.${deal.blocked}`);
      default:
        return t("comms.merchants.unavailable");
    }
  };
  return (
    <ul className="research-list merchant-list">
      {merchants.map((s) => {
        const m = s.merchant!;
        const contact = signalOption("contact_signal", s.id);
        const refuse = signalOption("refuse_signal", s.id);
        const contacted = s.feed.length > 0;
        return (
        <li key={s.id} className="merchant">
          <div className="research-title">
            <strong>{t(`comms.merchants.kinds.${m.kind}`)}</strong>
            <span className="sub">{t("comms.merchants.leaves", { count: Math.max(0, s.endsAt - view.cycle) })}</span>
          </div>
          {contact && (
            <ActionButton className="big" view={view} option={contact} onAction={onAction}>
              <ActionLabel text={t("actions.contactSignal")} cost={contact.cost} chance={contact.chance} />
            </ActionButton>
          )}
          {contacted && <blockquote className="merchant-hail">{t(`comms.merchants.hails.${m.event}` as never, { defaultValue: "" })}</blockquote>}
          {contacted && (
          <ol className="merchant-deals" aria-label={t("comms.merchants.dealsLabel")}>
            {m.deals.map((deal, i) => {
              const close = option(s.id, i);
              return (
                <li key={i} className="merchant-deal">
                  <div className="merchant-deal-terms">
                    <span>{t("comms.merchants.give", { list: list(deal.give.map(asset)) })}</span>
                    <span>{t("comms.merchants.receive", { list: list(deal.receive.map(asset)) })}</span>
                    {deal.skill && <span className="sub">{t("comms.merchants.needsSkill", { skill: names.skill(deal.skill) })}</span>}
                  </div>
                  {close ? (
                    <ActionButton className="big" view={view} option={close} onAction={onAction}>
                      <ActionLabel text={t("actions.closeDeal")} cost={close.cost} chance={close.chance} />
                    </ActionButton>
                  ) : (
                    <UnavailableButton reason={reason(deal)} ap={view.config.merchantDealAp}>
                      {t("actions.closeDeal")}
                    </UnavailableButton>
                  )}
                </li>
              );
            })}
          </ol>
          )}
          {refuse && (
            <ActionButton view={view} option={refuse} onAction={onAction}>
              <ActionLabel text={t("actions.refuseSignal")} cost={refuse.cost} chance={refuse.chance} />
            </ActionButton>
          )}
        </li>
        );
      })}
    </ul>
  );
}
