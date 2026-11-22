// Crewmate picker dialog for actions aimed at any crewmate, wherever they are: the Commander's Issue mission
// (`issue_mission`, #462) and the Premonition skill (`premonition`). The server offers one option per crewmate; these
// are collapsed into a single button on your own panel (InspectPanel / PeekBar), which opens this dialog to pick one.

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useTranslation } from "react-i18next";
import { type Action, type ActionOption, type PlayerId, type PlayerView } from "@mush2/shared";
import { standingSprite } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { FramedDialog } from "./FramedDialog.tsx";

/** The actions picked this way. */
export type PickerAction = "issue_mission" | "premonition";
const PICKER_ACTIONS: readonly PickerAction[] = ["issue_mission", "premonition"];
export const isPickerAction = (type: Action["type"]): type is PickerAction => (PICKER_ACTIONS as readonly string[]).includes(type);

/** The crewmate an option is for: each picker action names them in its own field (not `target`, see actionTarget.ts). */
function crewmateOf(action: Action): PlayerId | undefined {
  if (action.type === "issue_mission") return action.subordinate;
  if (action.type === "premonition") return action.subject;
  return undefined;
}

/** Keeps at most one option per picker action in `options` (for its button) and returns them all, by action, in `picks`. */
export function collapsePickers(options: ActionOption[]): { options: ActionOption[]; picks: Record<PickerAction, ActionOption[]> } {
  const picks: Record<PickerAction, ActionOption[]> = { issue_mission: [], premonition: [] };
  const collapsed: ActionOption[] = [];
  for (const o of options) {
    const type = o.action.type;
    if (isPickerAction(type)) {
      if (picks[type].length === 0) collapsed.push(o);
      picks[type].push(o);
    } else {
      collapsed.push(o);
    }
  }
  return { options: collapsed, picks };
}

export function CrewPickerDialog({
  kind,
  view,
  picks,
  onClose,
  onAction,
}: {
  /** The open picker, or null when closed. */
  kind: PickerAction | null;
  view: PlayerView;
  picks: Record<PickerAction, ActionOption[]>;
  onClose: () => void;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const [picked, setPicked] = useState<PlayerId | null>(null);

  const byId = new Map<PlayerId, ActionOption>();
  for (const o of kind ? picks[kind] : []) {
    const id = crewmateOf(o.action);
    if (id) byId.set(id, o);
  }
  const choices = view.players.filter((p) => byId.has(p.id));
  const pickedOption = picked ? byId.get(picked) : undefined;
  const texts =
    kind === "premonition"
      ? { title: t("premonitionPick.title"), close: t("premonitionPick.close"), pick: t("premonitionPick.pick"), confirm: t("premonitionPick.confirm") }
      : {
          title: t("issueMission.title"),
          close: t("issueMission.close"),
          pick: t("issueMission.pick", { amount: view.config.missionApGranted }),
          confirm: t("issueMission.confirm"),
        };

  const close = () => {
    setPicked(null);
    onClose();
  };

  return (
    <Dialog.Root
      open={kind !== null && choices.length > 0}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <FramedDialog heading={texts.title} closeLabel={texts.close}>
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
            <legend className="field-label">{texts.pick}</legend>
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
            {texts.confirm}
          </button>
        </form>
      </FramedDialog>
    </Dialog.Root>
  );
}
