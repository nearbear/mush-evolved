// The window opened by accessing a terminal. Blank for now except the research lab, which lists the researches.
// Open/closed is UI state held by GameScreen; the server only validates the access action.

import { Dialog } from "@base-ui/react/dialog";
import { RESEARCH_COMPLETE, RESEARCH_IDS, researchStatus, type Action, type EquipmentView, type PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { RESEARCH_CARDS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { ActionLabel } from "./ActionLabel.tsx";
import { costOf } from "./targets.ts";
import "./settings.css";

interface Props {
  terminal: EquipmentView | null;
  view: PlayerView;
  onAction: (action: Action) => void;
  onClose: () => void;
}

export function TerminalDialog({ terminal, view, onAction, onClose }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <Dialog.Root open={terminal !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup">
          <Dialog.Title className="settings-title">{terminal && names.equipment(terminal.type)}</Dialog.Title>
          {terminal?.type === "RESEARCH_LAB" && <ResearchList terminal={terminal} view={view} onAction={onAction} />}
          <Dialog.Close>{t("terminal.close")}</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Every research with its progress (public) and, when the view offers it, a button to work on it. */
function ResearchList({ terminal, view, onAction }: Omit<Props, "onClose"> & { terminal: EquipmentView }) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <ul className="research-list" aria-label={t("research.title")}>
      {RESEARCH_IDS.map((id) => {
        const percent = view.research[id] ?? 0;
        const action = view.legalActions.find((a) => a.type === "research" && a.equipment === terminal.id && a.research === id);
        const card = RESEARCH_CARDS[id.toLowerCase()];
        return (
          <li key={id} className="research-item">
            {card && <img className="research-card" src={card} alt="" />}
            <div className="research-body">
              <strong>{names.research(id)}</strong>
              <span className={`skill-status skill-status-${researchStatus(id)}`}>{t(`research.status.${researchStatus(id)}`)}</span>
              <progress max={RESEARCH_COMPLETE} value={percent} />
              <span>{percent >= RESEARCH_COMPLETE ? t("research.done") : t("research.progress", { percent })}</span>
            </div>
            {action && (
              <button type="button" onClick={() => onAction(action)}>
                <ActionLabel text={t("research.work")} cost={costOf(view, action)} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
