// The Com center terminal's Merchants tab (#143): each merchant ship in orbit with its hail and its deals. Anyone at the
// terminal reads it (`view.comms.terminal.merchants`); the Comms Officer closes a deal with the `close_deal` option from
// view.actions. A deal without an option is drawn disabled, with why: the reason the rules give (`blocked`), or that only
// the officer can close it.

import type { Action, ActionOption, MerchantView, PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { UnavailableButton } from "./CommandTerminal.tsx";

type Deal = MerchantView["deals"][number];
type Asset = Deal["give"][number] | Deal["receive"][number];

interface Props {
  merchants: MerchantView[];
  terminalId: string;
  officer: boolean;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function Merchants({ merchants, terminalId, officer, view, onAction }: Props) {
  const { t, i18n } = useTranslation();
  const names = useNames();
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
  const option = (merchant: string, deal: number): ActionOption | undefined =>
    view.actions.find(({ action: a }) => a.type === "close_deal" && a.equipment === terminalId && a.merchant === merchant && a.deal === deal);
  const reason = (deal: Deal) => {
    if (!officer) return t("comms.merchants.officerOnly");
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
      {merchants.map((m) => (
        <li key={m.id} className="merchant">
          <div className="research-title">
            <strong>{t(`comms.merchants.kinds.${m.kind}`)}</strong>
            <span className="sub">{t("comms.merchants.leaves", { count: Math.max(0, m.leavesAt - view.cycle) })}</span>
          </div>
          <blockquote className="merchant-hail">{t(`comms.merchants.hails.${m.event}` as never, { defaultValue: "" })}</blockquote>
          <ol className="merchant-deals" aria-label={t("comms.merchants.dealsLabel")}>
            {m.deals.map((deal, i) => {
              const close = option(m.id, i);
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
        </li>
      ))}
    </ul>
  );
}
