// The window opened by accessing a terminal. Blank for now except the research lab, which lists the researches, NERON's
// core, which lists the NERON projects in the same list, the Astro terminal, which lists your planets, PILGRED, which
// shows its repair, the Command terminal, which shows the heading and lets the Commander steer (ShipNavigation.tsx) and go home once PILGRED works, the Com
// center (CommsCenter.tsx), NERON's BIOS (BiosTerminal.tsx) and the turrets (TurretPanel.tsx).
// Open/closed is UI state held by GameView; the server only validates the access action.

import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { Tabs } from "@base-ui/react/tabs";
import React, { useState, type CSSProperties } from "react";
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
  type RelayTargetView,
} from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { CHECK_ICON, PILGRED_CARD, PROJECT_CARDS, RESEARCH_CARDS, skillIcon, UNCHECK_ICON } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { ActionLabel } from "./ActionLabel.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { RelayDetails, withGain } from "./RelayDetails.tsx";
import { BiosTerminal } from "./BiosTerminal.tsx";
import { CommsCenter } from "./CommsCenter.tsx";
import { TabOutline } from "./TabOutline.tsx";
import { TerminalShell } from "./TerminalShell.tsx";
import { PlanetList } from "./PlanetList.tsx";
import { CommandTerminal } from "./CommandTerminal.tsx";
import { TurretPanel } from "./TurretPanel.tsx";
import "./settings.css";
import "./terminal.css";

interface Props {
  terminal: EquipmentView | null;
  view: PlayerView;
  onAction: (action: Action) => void;
  onClose: () => void;
  /** Shares a planet in the Astrophysics feature, from the Astro terminal. */
  onSharePlanet?: (planet: string, text: string) => void;
}

export function TerminalDialog({ terminal, view, onAction, onClose, onSharePlanet }: Props) {
  const names = useNames();
  return (
    <Dialog.Root open={terminal !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className={`settings-popup terminal-popup kit-panel`}>
          {terminal && (
            <div className={`cut-card cut-top terminal-card terminal-outlined terminal-${terminal.type.toLowerCase()}`}>
            <TerminalShell name={names.equipment(terminal.type)} type={terminal.type} view={view}>
            {terminal?.type === "RESEARCH_LAB" && <ResearchList terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "NERON_CORE" && <ProjectList terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "ASTRO_MODULE" && <PlanetList terminal={terminal} view={view} onAction={onAction} onShare={onSharePlanet} />}
              {terminal?.type === "PILGRED" && <PilgredRepair terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "COM_CENTER" && <CommsCenter terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "NERON_BIOS_TERM" && <BiosTerminal terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "TURRET_COMMAND" && <TurretPanel terminal={terminal} view={view} onAction={onAction} />}
              {terminal?.type === "PILOT_MODULE" && <CommandTerminal key={terminal.id} terminal={terminal} view={view} onAction={onAction} />}
            </TerminalShell>
            </div>
          )}
          {terminal && <TabOutline key={terminal.id} shape="cut" line=".terminal-body" />}
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
      relay={view.relay.research}
      complete={RESEARCH_COMPLETE}
      cards={RESEARCH_CARDS}
      name={names.research}
      desc={(id) => t(`research.desc.${id}`, { defaultValue: "" }) || undefined}
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
      more={(id) =>
        // A Mush's own spoil and Saboteur's Contaminate, beside Participate when the view offers them (docs/plans/research-sabotage.md).
        (["spoil_research", "contaminate"] as const).flatMap((type) => {
          const option = view.actions.find(({ action: a }) => a.type === type && a.equipment === terminal.id && a.research === id);
          return option ? [{ option, label: type === "spoil_research" ? withGain(t, t("research.spoil"), view.relay.research[id]?.gain) : t("research.contaminate") }] : [];
        })
      }
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
      relay={view.relay.projects}
      complete={PROJECT_COMPLETE}
      cards={PROJECT_CARDS}
      name={names.project}
      desc={(id) => t(`projects.desc.${id}`, { defaultValue: "" }) || undefined}
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
        <RelayDetails target={view.relay.pilgred ?? undefined} view={view} />
      </div>
      {option && (
        <ActionButton view={view} option={option} onAction={onAction} hint={t("relay.help")}>
          <ActionLabel text={withGain(t, t("actions.repairPilgred"), view.relay.pilgred?.gain)} cost={option.cost} chance={option.chance} />
        </ActionButton>
      )}
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
  /** Each target's relay pool, from the view (only in its room). */
  relay: Record<string, RelayTargetView>;
  complete: number;
  cards: Record<string, string>;
  name: (id: string) => string;
  /** The description shown on hover, if the entry has one. */
  desc?: (id: string) => string | undefined;
  status: (id: string) => "full" | "partial" | "none";
  /** The view's offer to work on this entry, if any. */
  /** A checklist under an item: for research what must be in the lab before it can be worked on, for projects the skills that speed it up (the button itself comes from `view.actions`). */
  needs?: (id: string) => Checklist | null;
  option: (id: string) => ActionOption | undefined;
  /** Other buttons beside the work button, from the view's offers (research: own spoil, Contaminate). */
  more?: (id: string) => { option: ActionOption; label: string }[];
  view: PlayerView;
  onAction: (action: Action) => void;
}

/** Wraps an entry's name or card: hovering (or tapping) the trigger shows what the entry does. */
function EntryTip({ name, desc, trigger, children }: { name: string; desc?: string; trigger: React.ReactElement; children?: React.ReactNode }) {
  if (!desc) return React.cloneElement(trigger, undefined, children);
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} render={trigger} className="has-tip">
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card">
            <strong>{name}</strong>
            <p>{desc}</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * A research or project's progress bar. With samples pending their assay, the bar is the trigger for a tooltip saying how
 * much is pending (hover, focus or tap), so the percent beside it stays short and never wraps.
 */
function ProgressBar({ label, percent, complete, pending, style }: { label: string; percent: number; complete: number; pending: string | undefined; style: CSSProperties }) {
  if (!pending) return <div className="kit-progress neron" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={complete} aria-valuenow={percent} style={style} />;
  return (
    <Popover.Root>
      {/* Base UI makes a non-native trigger focusable itself, so keyboard users can open it too. */}
      <Popover.Trigger
        openOnHover
        delay={200}
        nativeButton={false}
        render={<div />}
        className="kit-progress neron has-pending"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={complete}
        aria-valuenow={percent}
        aria-valuetext={pending}
        style={style}
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip">{pending}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

type ProgressTab = "active" | "blocked" | "done";
const PROGRESS_TABS: readonly ProgressTab[] = ["active", "blocked", "done"];

/**
 * Every research or project with its progress (only in its room until complete), its relay tokens and, when the view offers it, a button to work on it, in three
 * tabs: Active (in progress, then available), Blocked (not offered by the view, so for research the lab misses a need)
 * and Done. Within a tab the order is the list's own. Empty Blocked or Done tabs are left out.
 */
function ProgressList({ label, ids, progress, relay, complete, cards, name, desc, status, needs, option: optionFor, more, view, onAction }: ProgressListProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ProgressTab>("active");
  const rows = ids.map((id) => ({ id, percent: progress[id] ?? 0, option: optionFor(id) }));
  const pendingOf = (id: string) => relay[id]?.pending ?? 0;
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
                    {card && <EntryTip name={name(id)} desc={desc?.(id)} trigger={<img className="research-card" src={card} alt="" />} />}
                    <div className="research-title">
                      <EntryTip name={name(id)} desc={desc?.(id)} trigger={<strong />}>{name(id)}</EntryTip>
                      <span className={`skill-status skill-status-${state}`}>{t(`research.status.${state}`)}</span>
                    </div>
                    <div className="research-body">
                      {key === "done" ? (
                        <span>{t("research.done")}</span>
                      ) : (
                        <div className="research-progress">
                          {/* Research: solid for verified progress, striped for pending samples not yet assayed (docs/plans/research-sabotage.md). */}
                          <ProgressBar
                            label={name(id)}
                            percent={percent}
                            complete={complete}
                            pending={pendingOf(id) ? t("research.withPending", { percent, pending: pendingOf(id) }) : undefined}
                            style={{ "--value": Math.min(1, percent / complete), "--pending": Math.min(1, pendingOf(id) / complete) } as CSSProperties}
                          />
                          <span>{t("research.percent", { percent })}</span>
                          {option && (
                            <ActionButton view={view} option={option} onAction={onAction} hint={t("relay.help")}>
                              <ActionLabel text={withGain(t, t("research.work"), relay[id]?.gain)} cost={option.cost} chance={option.chance} />
                            </ActionButton>
                          )}
                          {more?.(id).map(({ option: extra, label: text }) => (
                            <ActionButton key={extra.action.type} view={view} option={extra} onAction={onAction}>
                              <ActionLabel text={text} cost={extra.cost} chance={extra.chance} />
                            </ActionButton>
                          ))}
                        </div>
                      )}
                      <RelayDetails target={relay[id]} view={view} />
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
