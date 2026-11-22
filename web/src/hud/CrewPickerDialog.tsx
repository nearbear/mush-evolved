// Crewmate picker dialog for the Commander's Issue mission (`issue_mission`, #462).
// Collapses the server's per-subordinate `issue_mission` options into a single button
// in InspectPanel / PeekBar, then lets the Commander pick which active crewmate receives +3 AP.

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useTranslation } from "react-i18next";
import { type Action, type ActionOption, type PlayerId, type PlayerView } from "@mush2/shared";
import { standingSprite } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { FramedDialog } from "./FramedDialog.tsx";

/** Keeps at most one `issue_mission` option in `options` (for the action button) and returns all of them in `issueMission`. */
export function collapseIssueMission(options: ActionOption[]): { options: ActionOption[]; issueMission: ActionOption[] } {
  const issueMission: ActionOption[] = [];
  const collapsed: ActionOption[] = [];
  for (const o of options) {
    if (o.action.type === "issue_mission") {
      if (issueMission.length === 0) collapsed.push(o);
      issueMission.push(o);
    } else {
      collapsed.push(o);
    }
  }
  return { options: collapsed, issueMission };
}

export function IssueMissionDialog({
  open,
  view,
  options,
  onClose,
  onAction,
}: {
  open: boolean;
  view: PlayerView;
  options: ActionOption[];
  onClose: () => void;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const [picked, setPicked] = useState<PlayerId | null>(null);

  const byId = new Map<PlayerId, ActionOption>();
  for (const o of options) {
    if (o.action.type === "issue_mission") byId.set(o.action.subordinate, o);
  }
  const choices = view.players.filter((p) => byId.has(p.id));
  const pickedOption = picked ? byId.get(picked) : undefined;

  const close = () => {
    setPicked(null);
    onClose();
  };

  return (
    <Dialog.Root
      open={open && choices.length > 0}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <FramedDialog heading={t("issueMission.title")} closeLabel={t("issueMission.close")}>
        <form
          className="channel-create-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pickedOption) return;
            onAction(pickedOption.action);
            close();
          }}
        >
          <fieldset className="field">
            <legend className="field-label">
              {t("issueMission.pick", { amount: view.config.missionApGranted })}
            </legend>
            <div className="channel-picker">
              {choices.map((p) => {
                const on = picked === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="pick-tile channel-pick"
                    aria-pressed={on}
                    onClick={() => setPicked(on ? null : p.id)}
                  >
                    <span style={standingSprite(p.character, 1)} aria-hidden="true" />
                    <span>{names.characterGiven(p.character)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <button type="submit" disabled={!pickedOption}>
            {t("issueMission.confirm")}
          </button>
        </form>
      </FramedDialog>
    </Dialog.Root>
  );
}
