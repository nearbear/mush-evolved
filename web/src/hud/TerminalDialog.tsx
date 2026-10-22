// The window opened by accessing a terminal. Blank for now except the research lab, which lists the researches, NERON's
// core, which lists the NERON projects in the same list, the Astro terminal, which lists your planets, PILGRED, which
// shows its repair, the Command terminal, which offers the Commander the way home once PILGRED works, and the Com
// center (CommsCenter.tsx).
// Open/closed is UI state held by GameScreen; the server only validates the access action.

import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import {
  PILGRED_COMPLETE,
  PROJECT_COMPLETE,
  PROJECT_IDS,
  projectStatus,
  RESEARCH_COMPLETE,
  RESEARCH_IDS,
  researchStatus,
  type Action,
  type ActionOption,
  type EquipmentView,
  type PlayerView,
} from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { PILGRED_CARD, PROJECT_CARDS, RESEARCH_CARDS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { ActionLabel } from "./ActionLabel.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { CommsCenter } from "./CommsCenter.tsx";
import { PlanetList } from "./PlanetList.tsx";
import "./settings.css";
import "./terminal.css";

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
        <Dialog.Popup className={`settings-popup terminal-popup terminal-${terminal?.type.toLowerCase()}`}>
          <Dialog.Title className="settings-title">{terminal && names.equipment(terminal.type)}</Dialog.Title>
          {terminal?.type === "RESEARCH_LAB" && <ResearchList terminal={terminal} view={view} onAction={onAction} />}
          {terminal?.type === "NERON_CORE" && <ProjectList terminal={terminal} view={view} onAction={onAction} />}
          {terminal?.type === "ASTRO_MODULE" && <PlanetList terminal={terminal} view={view} onAction={onAction} />}
          {terminal?.type === "PILGRED" && <PilgredRepair terminal={terminal} view={view} onAction={onAction} />}
          {terminal?.type === "COM_CENTER" && <CommsCenter terminal={terminal} view={view} onAction={onAction} />}
          {terminal?.type === "PILOT_MODULE" && <ReturnToSol key={terminal.id} terminal={terminal} view={view} onAction={onAction} />}
          <Dialog.Close>{t("terminal.close")}</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ListProps = Omit<Props, "onClose"> & { terminal: EquipmentView };

function ResearchList({ terminal, view, onAction }: ListProps) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <ProgressList
      label={t("research.title")}
      ids={RESEARCH_IDS}
      progress={view.research}
      complete={RESEARCH_COMPLETE}
      cards={RESEARCH_CARDS}
      name={names.research}
      status={researchStatus}
      option={(id) => view.actions.find(({ action: a }) => a.type === "research" && a.equipment === terminal.id && a.research === id)}
      view={view}
      onAction={onAction}
    />
  );
}

function ProjectList({ terminal, view, onAction }: ListProps) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <ProgressList
      label={t("projects.title")}
      ids={PROJECT_IDS}
      progress={view.projects}
      complete={PROJECT_COMPLETE}
      cards={PROJECT_CARDS}
      name={names.project}
      status={projectStatus}
      option={(id) => view.actions.find(({ action: a }) => a.type === "project" && a.equipment === terminal.id && a.project === id)}
      view={view}
      onAction={onAction}
    />
  );
}

/** PILGRED's repair: its progress (sent only to people at the terminal) and, when the view offers it, the repair button. */
function PilgredRepair({ terminal, view, onAction }: ListProps) {
  const { t } = useTranslation();
  const percent = view.pilgred ?? 0;
  const option = view.actions.find(({ action: a }) => a.type === "repair_pilgred" && a.equipment === terminal.id);
  return (
    <div className="research-item" role="group" aria-label={t("pilgred.label")}>
      <img className="research-card" src={PILGRED_CARD} alt="" />
      <div className="research-body">
        <span>{t("pilgred.desc")}</span>
        <progress max={PILGRED_COMPLETE} value={percent} />
        <span>{percent >= PILGRED_COMPLETE ? t("pilgred.repaired") : t("pilgred.progress", { percent })}</span>
      </div>
      {option && (
        <ActionButton view={view} option={option} onAction={onAction}>
          <ActionLabel text={t("actions.repairPilgred")} cost={option.cost} chance={option.chance} />
        </ActionButton>
      )}
    </div>
  );
}

/**
 * The Command terminal's way home: offered by the view only to the Commander once PILGRED is repaired. It ends the game,
 * so the button asks for confirmation first (owner, 2026-10-21).
 */
function ReturnToSol({ terminal, view, onAction }: ListProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const option = view.actions.find(({ action: a }) => a.type === "return_to_sol" && a.equipment === terminal.id);
  if (!option) return null;
  if (confirming) {
    return (
      <div className="skill-confirm">
        <p>{t("returnToSol.confirm")}</p>
        <div className="skill-confirm-buttons">
          <button type="button" onClick={() => setConfirming(false)}>
            {t("returnToSol.back")}
          </button>
          <button
            type="button"
            onClick={() => {
              onAction(option.action);
              setConfirming(false);
            }}
          >
            {t("returnToSol.confirmYes")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="research-item" role="group" aria-label={t("actions.returnToSol")}>
      <div className="research-body">
        <span>{t("returnToSol.desc")}</span>
      </div>
      <ActionButton view={view} option={option} onAction={() => setConfirming(true)}>
        <ActionLabel text={t("actions.returnToSol")} cost={option.cost} chance={option.chance} />
      </ActionButton>
    </div>
  );
}

interface ProgressListProps {
  label: string;
  ids: readonly string[];
  progress: Record<string, number>;
  complete: number;
  cards: Record<string, string>;
  name: (id: string) => string;
  status: (id: string) => "full" | "partial" | "none";
  /** The view's offer to work on this entry, if any. */
  option: (id: string) => ActionOption | undefined;
  view: PlayerView;
  onAction: (action: Action) => void;
}

/** Every research or project with its progress (public) and, when the view offers it, a button to work on it. */
function ProgressList({ label, ids, progress, complete, cards, name, status, option: optionFor, view, onAction }: ProgressListProps) {
  const { t } = useTranslation();
  return (
    <ul className="research-list" aria-label={label}>
      {ids.map((id) => {
        const percent = progress[id] ?? 0;
        const option = optionFor(id);
        const card = cards[id.toLowerCase()];
        return (
          <li key={id} className="research-item">
            {card && <img className="research-card" src={card} alt="" />}
            <div className="research-body">
              <strong>{name(id)}</strong>
              <span className={`skill-status skill-status-${status(id)}`}>{t(`research.status.${status(id)}`)}</span>
              <progress max={complete} value={percent} />
              <span>{percent >= complete ? t("research.done") : t("research.progress", { percent })}</span>
            </div>
            {option && (
              <ActionButton view={view} option={option} onAction={onAction}>
                <ActionLabel text={t("research.work")} cost={option.cost} chance={option.chance} />
              </ActionButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
