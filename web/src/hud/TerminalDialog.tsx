// The window opened by accessing a terminal. Blank for now except the research lab, which lists the researches, NERON's
// core, which lists the NERON projects in the same list, the Astro terminal, which lists your planets, PILGRED, which
// shows its repair, the Command terminal, which shows the heading and lets the Commander steer (ShipNavigation.tsx) and go home once PILGRED works, the Com
// center (CommsCenter.tsx), NERON's BIOS (BiosTerminal.tsx) and the turrets (TurretPanel.tsx).
// Open/closed is UI state held by GameScreen; the server only validates the access action.

import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { useState } from "react";
import {
  hasSkill,
  PILGRED_COMPLETE,
  PROJECT_COMPLETE,
  PROJECT_IDS,
  PROJECTS,
  projectStatus,
  RESEARCH_COMPLETE,
  ANY_CONSUMABLE,
  RESEARCH_IDS,
  RESEARCH_REQUIRES,
  type ResearchNeed,
  researchNeedOrder,
  researchStatus,
  type ResearchId,
  type Action,
  type ActionOption,
  type EquipmentView,
  type PlayerView,
} from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { CHECK_ICON, PILGRED_CARD, PROJECT_CARDS, RESEARCH_CARDS, skillIcon, UNCHECK_ICON } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { ActionLabel } from "./ActionLabel.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { BiosTerminal } from "./BiosTerminal.tsx";
import { CommsCenter } from "./CommsCenter.tsx";
import { TerminalShell } from "./TerminalShell.tsx";
import { PlanetList } from "./PlanetList.tsx";
import { ShipNavigation } from "./ShipNavigation.tsx";
import { TurretPanel } from "./TurretPanel.tsx";
import "./settings.css";
import "./terminal.css";

interface Props {
  terminal: EquipmentView | null;
  view: PlayerView;
  onAction: (action: Action) => void;
  onClose: () => void;
}

export function TerminalDialog({ terminal, view, onAction, onClose }: Props) {
  const names = useNames();
  return (
    <Dialog.Root open={terminal !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className={`settings-popup terminal-popup kit-panel`}>
          {terminal && (
            <div className={`cut-card cut-top terminal-card terminal-${terminal.type.toLowerCase()}`}>
            <TerminalShell name={names.equipment(terminal.type)} type={terminal.type} view={view}>
            {terminal?.type === "RESEARCH_LAB" && <ResearchList terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "NERON_CORE" && <ProjectList terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "ASTRO_MODULE" && <PlanetList terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "PILGRED" && <PilgredRepair terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "COM_CENTER" && <CommsCenter terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "NERON_BIOS_TERM" && <BiosTerminal terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "TURRET_COMMAND" && <TurretPanel terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "PILOT_MODULE" && <ShipNavigation terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "PILOT_MODULE" && <ReturnToSol key={terminal.id} terminal={terminal} view={view} onAction={onAction} />}
            </TerminalShell>
            </div>
          )}
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
      needs={(id) => {
        const req = RESEARCH_REQUIRES[id as ResearchId];
        if (!req) return null;
        const met = view.researchNeeds?.[id] ?? [];
        const label = (need: ResearchNeed) =>
          need === "chun" ? t("research.needChun") : need === "postSelection" ? t("research.needPostSelection") : need.item === ANY_CONSUMABLE ? t("research.anyConsumable") : names.item(need.item);
        return { items: researchNeedOrder(req).map((need, i) => ({ label: label(need), met: met[i] ?? false })) };
      }}
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
      needs={(id) => {
        const skills = PROJECTS.find((p) => p.id === id)?.skills ?? [];
        // Only the worker's own skills speed up their work (relay.ts), so yours are the ones checked.
        return skills.length ? { items: skills.map((skill) => ({ label: names.skill(skill), met: hasSkill(view.you, skill), icon: skillIcon(skill) })) } : null;
      }}
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

interface Checklist {
  /** `icon` is an extra picture after the box (a project's skills show their skill icon). */
  items: { label: string; met: boolean; icon?: string }[];
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
  /** A checklist under an item: for research what must be in the lab before it can be worked on, for projects the skills that speed it up (the button itself comes from `view.actions`). */
  needs?: (id: string) => Checklist | null;
  option: (id: string) => ActionOption | undefined;
  view: PlayerView;
  onAction: (action: Action) => void;
}

type ProgressTab = "active" | "blocked" | "done";
const PROGRESS_TABS: readonly ProgressTab[] = ["active", "blocked", "done"];

/**
 * Every research or project with its progress (public) and, when the view offers it, a button to work on it, in three
 * tabs: Active (in progress, then available), Blocked (not offered by the view, so for research the lab misses a need)
 * and Done. Within a tab the order is the list's own. Empty Blocked or Done tabs are left out.
 */
function ProgressList({ label, ids, progress, complete, cards, name, status, needs, option: optionFor, view, onAction }: ProgressListProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ProgressTab>("active");
  const rows = ids.map((id) => ({ id, percent: progress[id] ?? 0, option: optionFor(id) }));
  const groups: Record<ProgressTab, typeof rows> = {
    active: [...rows.filter((r) => r.percent > 0 && r.percent < complete && r.option), ...rows.filter((r) => r.percent === 0 && r.option)],
    blocked: rows.filter((r) => r.percent < complete && !r.option),
    done: rows.filter((r) => r.percent >= complete),
  };
  const shown = PROGRESS_TABS.filter((key) => key === "active" || groups[key].length > 0);
  const current = shown.includes(tab) ? tab : "active";
  return (
    <Tabs.Root className="settings-tabs" value={current} onValueChange={(value) => setTab(value as ProgressTab)}>
      <Tabs.List className="settings-tab-list progress-tab-list" aria-label={label}>
        {shown.map((key) => (
          <Tabs.Tab key={key} className="settings-tab" value={key}>
            {t(`research.tabs.${key}`)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {shown.map((key) => (
        <Tabs.Panel key={key} value={key}>
          {groups[key].length === 0 ? (
            <p>{t("research.none")}</p>
          ) : (
            <ul className="research-list" aria-label={t(`research.tabs.${key}`)}>
              {groups[key].map(({ id, percent, option }) => {
                const card = cards[id.toLowerCase()];
                const needed = key !== "done" ? needs?.(id) : null;
                const state = status(id);
                return (
                  <li key={id} className={`research-item research-item-${key}`}>
                    {card && <img className="research-card" src={card} alt="" />}
                    <div className="research-title">
                      <strong>{name(id)}</strong>
                      <span className={`skill-status skill-status-${state}`}>{t(`research.status.${state}`)}</span>
                    </div>
                    <div className="research-body">
                      {key === "done" ? (
                        <span>{t("research.done")}</span>
                      ) : (
                        <div className="research-progress">
                          <progress max={complete} value={percent} />
                          <span>{t("research.percent", { percent })}</span>
                          {option && (
                            <ActionButton view={view} option={option} onAction={onAction}>
                              <ActionLabel text={t("research.work")} cost={option.cost} chance={option.chance} />
                            </ActionButton>
                          )}
                        </div>
                      )}
                      {needed && (
                        <div className="research-needs">
                          <ul>
                            {needed.items.map(({ label, met, icon }) => (
                              <li key={label} className={met ? "research-need-met" : undefined}>
                                <img src={met ? CHECK_ICON : UNCHECK_ICON} alt={met ? t("research.met") : t("research.unmet")} />
                                {icon && <img src={icon} alt="" />}
                                {label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
