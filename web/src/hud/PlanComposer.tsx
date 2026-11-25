// Channel plan composer (docs/plans/on-call.md, #315): a terminal-framed dialog on desktop and a full-screen sheet on
// phones. Everything it offers comes from the view; it never computes legality (refusals come back from the server as
// a toast while keeping the draft intact).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@base-ui/react/dialog";
import {
  ITEM_TYPES,
  PLAN_PURPOSES,
  PROJECT_COMPLETE,
  PROJECT_IDS,
  RESEARCH_COMPLETE,
  RESEARCH_IDS,
  type DraftSlot,
  type PlanDraft,
  type PlanPurpose,
  type PlanTask,
  type PlanTaskType,
  type PlayerId,
  type PlayerView,
  type PrivateChannel,
  type RoomId,
} from "@mush2/shared";
import { useNames } from "../i18n/names.ts";
import { FramedDialog } from "./FramedDialog.tsx";

const TASK_TYPES: readonly PlanTaskType[] = [
  "research",
  "project",
  "repair_pilgred",
  "heal",
  "comfort",
  "stt",
  "fiery_speech",
  "boring_speech",
  "bring",
];

export function PlanComposer({
  view,
  channel,
  open,
  onOpenChange,
  onPost,
}: {
  view: PlayerView;
  channel: PrivateChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPost: (plan: PlanDraft) => void;
}) {
  const { t, i18n } = useTranslation();
  const names = useNames();

  const validRooms = useMemo<RoomId[]>(
    () =>
      Object.entries(view.rooms)
        .filter(([, doors]) => doors.length > 0)
        .map(([id]) => id)
        .sort((a, b) => names.room(a).localeCompare(names.room(b), i18n.language)),
    [view.rooms, names, i18n.language],
  );

  const livingPeople = useMemo(() => [view.you, ...view.players].filter((p) => p.alive), [view.you, view.players]);
  const memberTargets = useMemo(() => livingPeople.filter((p) => channel.members.includes(p.id)), [livingPeople, channel.members]);
  const otherTargets = useMemo(() => livingPeople.filter((p) => !channel.members.includes(p.id)), [livingPeople, channel.members]);
  const onCallReservable = useMemo(() => memberTargets.filter((p) => p.id !== view.you.id), [memberTargets, view.you.id]);

  const researchOptions = useMemo(() => {
    const unfinished = RESEARCH_IDS.filter((id) => (view.research[id] ?? 0) < RESEARCH_COMPLETE);
    const list = unfinished.length > 0 ? unfinished : [...RESEARCH_IDS];
    return [...list].sort((a, b) => names.research(a).localeCompare(names.research(b), i18n.language));
  }, [view.research, names, i18n.language]);

  const projectOptions = useMemo(() => {
    const unfinished = PROJECT_IDS.filter((id) => (view.projects[id] ?? 0) < PROJECT_COMPLETE);
    const list = unfinished.length > 0 ? unfinished : [...PROJECT_IDS];
    return [...list].sort((a, b) => names.project(a).localeCompare(names.project(b), i18n.language));
  }, [view.projects, names, i18n.language]);

  const itemOptions = useMemo(
    () => Object.keys(ITEM_TYPES).sort((a, b) => names.item(a).localeCompare(names.item(b), i18n.language)),
    [names, i18n.language],
  );

  const defaultRoom = validRooms.includes(view.you.room) ? view.you.room : (validRooms[0] ?? "");
  const [room, setRoom] = useState<RoomId>(defaultRoom);
  const [purpose, setPurpose] = useState<PlanPurpose>("expedition");
  const [slots, setSlots] = useState<DraftSlot[]>([]);

  const reset = () => {
    setRoom(validRooms.includes(view.you.room) ? view.you.room : (validRooms[0] ?? ""));
    setPurpose("expedition");
    setSlots([]);
  };

  // Close and reset once the server's view reflects an open plan for this channel (or planning closed).
  // If the server refused `postPlan`, no open plan arrives and the draft stays open for editing.
  const hasOpenPlan = view.plans.some((p) => p.channel === channel.id && p.status === "open");
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset/onOpenChange are tied to the open plan arriving from the server.
  useEffect(() => {
    if (open && (hasOpenPlan || channel.planningClosed)) {
      onOpenChange(false);
      reset();
    }
  }, [open, hasOpenPlan, channel.planningClosed]);

  const defaultTask = (type: PlanTaskType): PlanTask => {
    const firstTarget = memberTargets[0]?.id ?? otherTargets[0]?.id ?? view.you.id;
    switch (type) {
      case "research":
        return { type, research: researchOptions[0] ?? RESEARCH_IDS[0]! };
      case "project":
        return { type, project: projectOptions[0] ?? PROJECT_IDS[0]! };
      case "heal":
      case "comfort":
      case "stt":
        return { type, target: firstTarget };
      case "bring":
        return { type, itemType: itemOptions[0] ?? "medikit" };
      case "repair_pilgred":
      case "fiery_speech":
      case "boring_speech":
        return { type };
    }
  };

  const updateSlot = (index: number, next: DraftSlot) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? next : s)));
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const setReserved = (index: number, value: string) => {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (!value) {
          const { reservedFor: _removed, ...rest } = s;
          return rest;
        }
        return { ...s, reservedFor: value as PlayerId };
      }),
    );
  };

  const maxSlots = view.config.planSlotsPerPlan;
  const empty = slots.length === 0;
  const overCap = slots.length > maxSlots;
  const disabledReason = empty
    ? t("plans.composer.emptyReason")
    : overCap
      ? t("plans.composer.overCapReason", { max: maxSlots })
      : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <FramedDialog heading={t("plans.composer.title")} closeLabel={t("plans.composer.close")} className="plan-composer-dialog">
        <form
          className="plan-composer-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (disabledReason !== null || !room) return;
            onPost({ channel: channel.id, room, purpose, slots });
          }}
        >
          <div className="plan-composer-basics">
            <label className="field">
              <span className="field-label">{t("plans.composer.roomLabel")}</span>
              <select value={room} onChange={(e) => setRoom(e.target.value)}>
                {validRooms.map((id) => (
                  <option key={id} value={id}>
                    {names.room(id)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">{t("plans.composer.purposeLabel")}</span>
              <select value={purpose} onChange={(e) => setPurpose(e.target.value as PlanPurpose)}>
                {PLAN_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {t(`plans.purposes.${p}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="field plan-composer-slots">
            <legend className="field-label">{t("plans.composer.slotsLabel", { count: slots.length, max: maxSlots })}</legend>

            {slots.length > 0 && (
              <ul className="plan-composer-slot-list">
                {slots.map((slot, index) => (
                  <li key={index} className="plan-composer-slot">
                    <div className="plan-composer-slot-head">
                      <strong>{slot.kind === "onCall" ? t("plans.onCall") : t("plans.composer.taskTypeLabel")}</strong>
                      <button
                        type="button"
                        className="plan-composer-remove"
                        aria-label={t("plans.composer.removeSlot", { index: index + 1 })}
                        onClick={() => removeSlot(index)}
                      >
                        ×
                      </button>
                    </div>

                    {slot.kind === "task" && (
                      <div className="plan-composer-slot-fields">
                        <label className="field">
                          <span className="field-label">{t("plans.composer.taskTypeLabel")}</span>
                          <select
                            value={slot.task.type}
                            onChange={(e) => {
                              const nextType = e.target.value as PlanTaskType;
                              updateSlot(index, { ...slot, task: defaultTask(nextType) });
                            }}
                          >
                            {TASK_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {t(`plans.taskType.${type}`)}
                              </option>
                            ))}
                          </select>
                        </label>

                        {slot.task.type === "research" && (
                          <label className="field">
                            <span className="field-label">{t("plans.composer.researchLabel")}</span>
                            <select
                              value={slot.task.research}
                              onChange={(e) => updateSlot(index, { ...slot, task: { type: "research", research: e.target.value } })}
                            >
                              {researchOptions.map((id) => (
                                <option key={id} value={id}>
                                  {names.research(id)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        {slot.task.type === "project" && (
                          <label className="field">
                            <span className="field-label">{t("plans.composer.projectLabel")}</span>
                            <select
                              value={slot.task.project}
                              onChange={(e) => updateSlot(index, { ...slot, task: { type: "project", project: e.target.value } })}
                            >
                              {projectOptions.map((id) => (
                                <option key={id} value={id}>
                                  {names.project(id)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        {(slot.task.type === "heal" || slot.task.type === "comfort" || slot.task.type === "stt") && (
                          <label className="field">
                            <span className="field-label">{t("plans.composer.targetLabel")}</span>
                            <select
                              value={slot.task.target}
                              onChange={(e) => {
                                const taskType = slot.task.type as "heal" | "comfort" | "stt";
                                updateSlot(index, { ...slot, task: { type: taskType, target: e.target.value as PlayerId } });
                              }}
                            >
                              {memberTargets.length > 0 && (
                                <optgroup label={t("plans.composer.channelMembers")}>
                                  {memberTargets.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {names.character(p.character)}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {otherTargets.length > 0 && (
                                <optgroup label={t("plans.composer.otherCrew")}>
                                  {otherTargets.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {names.character(p.character)}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </label>
                        )}

                        {slot.task.type === "bring" && (
                          <label className="field">
                            <span className="field-label">{t("plans.composer.itemLabel")}</span>
                            <select
                              value={slot.task.itemType}
                              onChange={(e) => updateSlot(index, { ...slot, task: { type: "bring", itemType: e.target.value } })}
                            >
                              {itemOptions.map((id) => (
                                <option key={id} value={id}>
                                  {names.item(id)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}

                    <label className="field">
                      <span className="field-label">{t("plans.composer.reservedForLabel")}</span>
                      <select value={slot.reservedFor ?? ""} onChange={(e) => setReserved(index, e.target.value)}>
                        <option value="">{t("plans.composer.anyone")}</option>
                        {(slot.kind === "onCall" ? onCallReservable : memberTargets).map((p) => (
                          <option key={p.id} value={p.id}>
                            {names.character(p.character)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <div className="plan-composer-add-row">
              <button type="button" onClick={() => setSlots((prev) => [...prev, { kind: "onCall" }])}>
                {t("plans.composer.addOnCall")}
              </button>
              <button type="button" onClick={() => setSlots((prev) => [...prev, { kind: "task", task: defaultTask("research") }])}>
                {t("plans.composer.addTask")}
              </button>
            </div>
          </fieldset>

          <div className="plan-composer-footer">
            {disabledReason !== null && <p className="sub plan-composer-reason">{disabledReason}</p>}
            <button type="submit" disabled={disabledReason !== null || !room}>
              {t("plans.composer.post")}
            </button>
          </div>
        </form>
      </FramedDialog>
    </Dialog.Root>
  );
}
