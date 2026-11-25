// Channel plan card (docs/plans/on-call.md, #315): shows a private channel's open or latest finished plan, with
// Claim, Withdraw, Done, Cancel and Go buttons driven strictly from `view.actions` (no legality in the client).

import { useTranslation } from "react-i18next";
import { affordable, type Action, type ActionOption, type Plan, type PlanTask, type PlayerId, type PlayerView } from "@mush2/shared";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";

function findOption(view: PlayerView, match: (a: Action) => boolean): ActionOption | undefined {
  return view.actions.find((o) => match(o.action));
}

export function PlanCard({
  view,
  plan,
  onAction,
  onNewPlan,
}: {
  view: PlayerView;
  plan: Plan;
  onAction?: ((action: Action) => void) | undefined;
  onNewPlan?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const names = useNames();

  const nameOf = (id: PlayerId): string => {
    const person = id === view.you.id ? view.you : view.players.find((p) => p.id === id);
    return person ? names.characterGiven(person.character) : id;
  };

  const taskLabel = (task: PlanTask): string => {
    switch (task.type) {
      case "research":
        return t("plans.task.research", { name: names.research(task.research) });
      case "project":
        return t("plans.task.project", { name: names.project(task.project) });
      case "repair_pilgred":
        return t("plans.task.repair_pilgred");
      case "heal":
        return t("plans.task.heal", { name: nameOf(task.target) });
      case "comfort":
        return t("plans.task.comfort", { name: nameOf(task.target) });
      case "stt":
        return t("plans.task.stt", { name: nameOf(task.target) });
      case "fiery_speech":
        return t("plans.task.fiery_speech");
      case "boring_speech":
        return t("plans.task.boring_speech");
      case "bring":
        return t("plans.task.bring", { item: names.item(task.itemType) });
    }
  };

  const summonOpt = onAction ? findOption(view, (a) => a.type === "summon" && a.plan === plan.id) : undefined;
  const cancelOpt = onAction ? findOption(view, (a) => a.type === "cancel_plan" && a.plan === plan.id) : undefined;
  const roomName = names.room(plan.room);
  const expiresDay = plan.postedDay + view.config.planExpiryDays;

  return (
    <section className={`plan-card plan-card-${plan.status}`} aria-label={t("plans.heading")}>
      <div className="plan-card-head">
        <div className="plan-card-title-block">
          <div className="plan-card-title-row">
            <strong className="plan-card-title">
              {t(`plans.purposes.${plan.purpose}`)} — {roomName}
            </strong>
            {plan.status !== "open" && <span className={`plan-status plan-status-${plan.status}`}>{t(`plans.status.${plan.status}`)}</span>}
          </div>
          <p className="sub plan-card-meta">
            {t("plans.by", { name: nameOf(plan.author) })}
            {plan.status === "open" && ` · ${t("plans.expires", { day: expiresDay })}`}
          </p>
        </div>
        {onNewPlan && (
          <button type="button" className="plan-new-btn" onClick={onNewPlan}>
            {t("plans.newPlan")}
          </button>
        )}
      </div>

      <ul className="plan-slots">
        {plan.slots.map((slot, index) => {
          const isStruck = slot.kind === "task" && slot.struck !== undefined;
          const claimOpt = onAction ? findOption(view, (a) => a.type === "claim_slot" && a.plan === plan.id && a.slot === index) : undefined;
          const withdrawOpt = onAction ? findOption(view, (a) => a.type === "withdraw_slot" && a.plan === plan.id && a.slot === index) : undefined;
          const doneOpt = onAction ? findOption(view, (a) => a.type === "mark_done" && a.plan === plan.id && a.slot === index) : undefined;

          return (
            <li key={index} className={isStruck ? "plan-slot plan-slot-struck" : "plan-slot"}>
              <div className="plan-slot-info">
                <span className="plan-slot-label">{slot.kind === "onCall" ? t("plans.onCall") : taskLabel(slot.task)}</span>
                <span className="plan-slot-detail">
                  {isStruck ? (
                    <>
                      {slot.holder !== null && <span className="plan-slot-holder">{nameOf(slot.holder)} · </span>}
                      <span className="plan-slot-badge plan-slot-badge-struck">{t(`plans.struck.${slot.struck!}`)}</span>
                    </>
                  ) : slot.kind === "task" && slot.done ? (
                    <>
                      {slot.holder !== null && <span className="plan-slot-holder">{nameOf(slot.holder)} · </span>}
                      <span className="plan-slot-badge plan-slot-badge-done">✓ {t("plans.done")}</span>
                    </>
                  ) : slot.kind === "onCall" && slot.outcome !== undefined ? (
                    slot.outcome === "unclaimed" ? (
                      <span className="sub">{t("plans.outcome.unclaimed")}</span>
                    ) : (
                      <>
                        {slot.holder !== null && <span className="plan-slot-holder">{nameOf(slot.holder)} · </span>}
                        <span className={`plan-slot-badge plan-outcome-${slot.outcome}`}>{t(`plans.outcome.${slot.outcome}`)}</span>
                      </>
                    )
                  ) : slot.holder !== null ? (
                    <span className="plan-slot-holder">{nameOf(slot.holder)}</span>
                  ) : slot.reservedFor !== undefined ? (
                    <span className="sub">{t("plans.reservedFor", { name: nameOf(slot.reservedFor) })}</span>
                  ) : (
                    <span className="sub">{t("plans.unclaimed")}</span>
                  )}
                </span>
              </div>

              {(claimOpt || withdrawOpt || doneOpt) && onAction && (
                <div className="plan-slot-actions">
                  {claimOpt && (
                    <ActionButton view={view} option={claimOpt} onAction={onAction}>
                      {t("plans.claim")}
                    </ActionButton>
                  )}
                  {doneOpt && (
                    <ActionButton view={view} option={doneOpt} onAction={onAction}>
                      {t("plans.markDone")}
                    </ActionButton>
                  )}
                  {withdrawOpt && (
                    <ActionButton view={view} option={withdrawOpt} onAction={onAction}>
                      {t("plans.withdraw")}
                    </ActionButton>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {(summonOpt || cancelOpt) && onAction && (
        <div className="plan-card-actions">
          {summonOpt && (
            <div className="plan-go-wrap">
              <ActionButton view={view} option={summonOpt} onAction={onAction}>
                {t("plans.go")}
              </ActionButton>
              {!affordable(summonOpt) && <span className="sub plan-go-hint">{t("plans.goToRoom", { room: roomName })}</span>}
            </div>
          )}
          {cancelOpt && (
            <ActionButton view={view} option={cancelOpt} onAction={onAction}>
              {t("plans.cancel")}
            </ActionButton>
          )}
        </div>
      )}
    </section>
  );
}
