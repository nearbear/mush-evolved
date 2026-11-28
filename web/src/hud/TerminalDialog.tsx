// The window opened by accessing a terminal. Blank for now except the research lab, which lists the researches, NERON's
// core, which lists the NERON projects in the same list, the Astro terminal, which lists your planets, PILGRED, which
// shows its repair, the Command terminal, which shows the heading and lets the Commander steer (ShipNavigation.tsx) and go home once PILGRED works, the Com
// center (CommsCenter.tsx), NERON's BIOS (BiosTerminal.tsx) and the turrets (TurretPanel.tsx).
// Open/closed is UI state held by GameView; the server only validates the access action.

import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { Tabs } from "@base-ui/react/tabs";
import React, { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  DEFAULT_CONFIG,
  hasSkill,
  MAX_SHARED_PILGRED_TEXT_LENGTH,
  PILGRED_COMPLETE,
  PROJECT_COMPLETE,
  PROJECT_IDS,
  PROJECTS,
  projectStatus,
  RESEARCH_COMPLETE,
  ANY_CONSUMABLE,
  RESEARCH_IDS,
  RESEARCH_REQUIRES,
  SUPER_CALC_EQUIPMENT,
  type ResearchNeed,
  researchNeedOrder,
  researchStatus,
  type ResearchId,
  type Action,
  type ActionOption,
  type EquipmentView,
  type PlanetTag,
  type PlayerView,
  type RelayTargetView,
  type SharedPlantRow,
  type Target,
} from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { CHECK_ICON, itemIcon, PILGRED_CARD, PROJECT_CARDS, RESEARCH_CARDS, skillIcon, UNCHECK_ICON } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { useMobile } from "../useMobile.ts";
import { ActionLabel } from "./ActionLabel.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { ConsumeEffects } from "./ConsumeEffects.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { InventoryToggle, measureBand } from "./InventoryOverlay.tsx";
import { gainHint, RelayDetails, withGain } from "./RelayDetails.tsx";
import { BiosTerminal } from "./BiosTerminal.tsx";
import { CommsCenter } from "./CommsCenter.tsx";
import { TerminalCollapsible } from "./TerminalCollapsible.tsx";
import { TerminalFrame } from "./TerminalFrame.tsx";
import { terminalLogin } from "./terminalUsername.ts";
import { PlanetList } from "./PlanetList.tsx";
import { SkillPopover } from "./SkillSlots.tsx";
import { PlantTerminal } from "./PlantTerminal.tsx";
import { CommandTerminal } from "./CommandTerminal.tsx";
import { TurretPanel } from "./TurretPanel.tsx";
import "./settings.css";
import "./terminal.css";

interface Props {
  terminal: EquipmentView | null;
  view: PlayerView;
  onAction: (action: Action) => void;
  onClose: () => void;
  /** The inventory opened from the terminal: what is selected, and selecting a tile (as in the room view's). */
  selected?: Target;
  onSelect?: (target: Target) => void;
  /** Shares a planet in the Astrophysics feature, from the Astro terminal. */
  onSharePlanet?: (planet: string, sectors: (PlanetTag | null)[], text: string) => void;
  /** Shares the greenhouse plant status in the Botany feature, from the Hydroponics center. */
  onSharePlants?: (plants: SharedPlantRow[], text: string) => void;
  /** Shares PILGRED's repair progress in the PILGRED feature, from the PILGRED terminal. */
  onSharePilgred?: (percent: number, text: string) => void;
}

export function TerminalDialog({ terminal, view, onAction, onClose, selected, onSelect, onSharePlanet, onSharePlants, onSharePilgred }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  const mobile = useMobile();
  const titleId = useId();
  const inventoryId = useId();
  // The inventory stays usable from a terminal (owner, 2026-11-25): its sack is on the title row on a phone, and over
  // the backdrop where the room view has it on desktop; it opens over the terminal's body. Shut for each terminal.
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [openFor, setOpenFor] = useState(terminal?.id);
  if (openFor !== terminal?.id) {
    setOpenFor(terminal?.id);
    setInventoryOpen(false);
  }
  const sackRef = useRef<HTMLButtonElement>(null);
  const inventoryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (inventoryOpen) inventoryRef.current?.focus({ preventScroll: true });
  }, [inventoryOpen]);
  const sackSpot = useRoomSackSpot(terminal !== null && !mobile && view.you.alive);
  const canInventory = view.you.alive && selected !== undefined && onSelect !== undefined;
  // Where the room view's inventory would open, so this one opens the same size in the same place (owner, 2026-11-27);
  // over the terminal's body only when the room view isn't on screen (a phone's other tabs).
  const inventorySpot = useRoomInventorySpot(terminal !== null && canInventory && inventoryOpen);
  // A press on the terminal outside the inventory (and its sack) shuts the inventory and leaves the terminal open.
  useEffect(() => {
    if (!inventoryOpen) return;
    const onPress = (e: PointerEvent) => {
      const target = e.target instanceof Node ? e.target : null;
      if (!target || inventoryRef.current?.contains(target) || sackRef.current?.contains(target)) return;
      if (target instanceof Element ? target.closest(".terminal-popup") : target.parentElement?.closest(".terminal-popup")) setInventoryOpen(false);
    };
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, [inventoryOpen]);
  const inventory = canInventory && inventoryOpen && (
    <section
      ref={inventoryRef}
      id={inventoryId}
      tabIndex={-1}
      className={inventorySpot ? "panel inventory-popup terminal-inventory" : "panel inventory-popup"}
      style={inventorySpot}
      aria-label={t("inventory.button")}
    >
      <InventoryPanel view={view} selected={selected} onAction={onAction} onSelect={onSelect} />
    </section>
  );
  const sack = canInventory && (
    <InventoryToggle
      ref={sackRef}
      view={view}
      open={inventoryOpen}
      glow={!inventoryOpen && selected.kind === "item"}
      controls={inventoryOpen ? inventoryId : undefined}
      onClick={() => setInventoryOpen((o) => !o)}
    />
  );
  return (
    <Dialog.Root
      open={terminal !== null}
      onOpenChange={(open, details) => {
        if (open) return;
        // Escape shuts the inventory first, then the terminal.
        if (inventoryOpen && details.reason === "escape-key") {
          setInventoryOpen(false);
          sackRef.current?.focus({ preventScroll: true });
          return;
        }
        onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup terminal-popup kit-panel" aria-labelledby={titleId}>
          {terminal && (
            <TerminalFrame
              key={terminal.id}
              name={names.equipment(terminal.type)}
              type={terminal.type}
              login={terminalLogin(terminal.type, view, terminal.id)}
              onClose={onClose}
              titleId={titleId}
              actions={mobile ? sack : undefined}
              overlay={inventory && !inventorySpot ? inventory : undefined}
            >
              <TerminalBody terminal={terminal} view={view} onAction={onAction} onSharePlanet={onSharePlanet} onSharePlants={onSharePlants} onSharePilgred={onSharePilgred} />
            </TerminalFrame>
          )}
          {inventorySpot && inventory}
          {!mobile && sack && sackSpot && (
            <div className="terminal-sack" style={sackSpot}>
              {sack}
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Desktop: where the room view's sack is on screen, so the terminal can draw its own over the backdrop at the same spot.
 * The page doesn't scroll under a modal, so it moves only when the window resizes.
 */
function useRoomSackSpot(active: boolean): CSSProperties | undefined {
  const [spot, setSpot] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      const sack = document.querySelector(".room-view .inventory-toggle");
      const box = sack && sack.getClientRects().length > 0 ? sack.getBoundingClientRect() : null;
      setSpot((old) => (box ? (old?.left === box.left && old.top === box.top ? old : { left: box.left, top: box.top }) : undefined));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);
  return active ? spot : undefined;
}

/**
 * Where the room view's inventory panel would be on screen (measureBand), as a fixed position, or undefined when the
 * room view isn't shown. The page doesn't scroll under a modal, so it moves only when the window resizes.
 */
function useRoomInventorySpot(active: boolean): CSSProperties | undefined {
  const [spot, setSpot] = useState<{ top: number; bottom: number; left: number; right: number }>();
  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      const room = document.querySelector(".room-view");
      const band = room && measureBand(room);
      if (!room || !band) return setSpot(undefined);
      const box = room.getBoundingClientRect();
      const page = document.documentElement;
      const next = { top: box.top + band.top, bottom: page.clientHeight - box.bottom + band.bottom, left: box.left, right: page.clientWidth - box.right };
      setSpot((old) => (old && old.top === next.top && old.bottom === next.bottom && old.left === next.left && old.right === next.right ? old : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);
  if (!active || !spot) return undefined;
  // The room view's own 0.5rem side margins (inventory.css), kept in rem so they follow the UI scale.
  return { top: spot.top, bottom: spot.bottom, left: `calc(${spot.left}px + 0.5rem)`, right: `calc(${spot.right}px + 0.5rem)` };
}

type ListProps = Omit<Props, "onClose"> & { terminal: EquipmentView };

/** What a terminal shows inside its frame, by type (blank for the rest). Exported for the design kit. */
export function TerminalBody({ terminal, view, onAction, onSharePlanet, onSharePlants, onSharePilgred }: ListProps) {
  return (
    <>
      {terminal.type === "RESEARCH_LAB" && <ResearchList terminal={terminal} view={view} onAction={onAction} />}
      {terminal.type === "NERON_CORE" && <ProjectList terminal={terminal} view={view} onAction={onAction} />}
      {terminal.type === "ASTRO_MODULE" && <PlanetList terminal={terminal} view={view} onAction={onAction} onShare={onSharePlanet} />}
      {terminal.type === "PLANT_CONTROLLER" && <PlantTerminal terminal={terminal} view={view} onShare={onSharePlants} />}
      {terminal.type === "DRUG_DISP" && <DrugDispenser terminal={terminal} view={view} onAction={onAction} />}
      {terminal.type === "PILGRED" && <PilgredRepair terminal={terminal} view={view} onAction={onAction} onSharePilgred={onSharePilgred} />}
      {terminal.type === "COM_CENTER" && <CommsCenter terminal={terminal} view={view} onAction={onAction} />}
      {terminal.type === "NERON_BIOS_TERM" && <BiosTerminal terminal={terminal} view={view} onAction={onAction} />}
      {terminal.type === "TURRET_COMMAND" && <TurretPanel terminal={terminal} view={view} onAction={onAction} />}
      {terminal.type === SUPER_CALC_EQUIPMENT && <SuperCalc terminal={terminal} view={view} onAction={onAction} />}
      {terminal.type === "PILOT_MODULE" && <CommandTerminal key={terminal.id} terminal={terminal} view={view} onAction={onAction} />}
    </>
  );
}

/**
 * The Super Calculator (#478): Compute Eden's coordinates, one big button while the view offers it (disabled, with why,
 * while fragments are short or you are dirty), then a line saying they are computed.
 */
function SuperCalc({ terminal, view, onAction }: ListProps) {
  const { t } = useTranslation();
  const option = view.actions.find(({ action: a }) => a.type === "compute_eden" && a.equipment === terminal.id);
  if (view.edenComputed) return <p>{t("superCalc.computed")}</p>;
  if (!option) return null;
  return (
    <ActionButton className="big" view={view} option={option} onAction={onAction}>
      <ActionLabel text={t("actions.computeEden")} cost={option.cost} chance={option.chance} />
    </ActionButton>
  );
}

/**
 * The research lab: under the tab line, a collapsed beginner's primer on research (owner, 2026-11-25), then, for a Mush offered a spoil, one toggle
 * that turns every Progress button into that research's spoil, showing 0% (client-only; it starts off each time the
 * terminal opens).
 */
function ResearchList({ terminal, view, onAction }: ListProps) {
  const { t } = useTranslation();
  const names = useNames();
  const [spoiling, setSpoiling] = useState(false);
  const spoilFor = (id: string) => view.actions.find(({ action: a }) => a.type === "spoil_research" && a.equipment === terminal.id && a.research === id);
  const canSpoil = view.actions.some(({ action: a }) => a.type === "spoil_research" && a.equipment === terminal.id);
  const spoilOn = spoiling && canSpoil;
  return (
    <ProgressList
      intro={
        <>
          <TerminalCollapsible heading={t("research.basics")}>
            <p>{t("research.basicsWhat")}</p>
            <p>{t("research.basicsWork")}</p>
            <p>{t("research.basicsTeam")}</p>
            <p>{t("research.basicsNeeds")}</p>
          </TerminalCollapsible>
          {canSpoil && (
            <div className="research-toolbar">
              <button type="button" className="research-spoil-toggle" aria-pressed={spoilOn} onClick={() => setSpoiling(!spoilOn)}>
                <img src={spoilOn ? CHECK_ICON : UNCHECK_ICON} alt="" />
                {t("research.spoil")}
              </button>
            </div>
          )}
        </>
      }
      label={t("research.title")}
      ids={RESEARCH_IDS}
      progress={view.research}
      relay={view.relay.research}
      complete={RESEARCH_COMPLETE}
      marks={DEFAULT_CONFIG.research.assayMarks}
      cards={RESEARCH_CARDS}
      name={names.research}
      desc={(id) => t(`research.desc.${id}`, { defaultValue: "" }) || undefined}
      unimplemented={(id) => researchStatus(id) === "none"}
      needs={(id) => {
        const req = RESEARCH_REQUIRES[id as ResearchId];
        if (!req) return null;
        const met = view.researchNeeds?.[id] ?? [];
        const label = (need: ResearchNeed) =>
          need === "chun"
            ? t("research.needChun")
            : need === "postSelection"
              ? t("research.needPostSelection")
              : need === "deadMush"
                ? t("research.needDeadMush")
                : need.item === ANY_CONSUMABLE
                  ? t("research.anyConsumable")
                  : names.item(need.item);
        return { items: researchNeedOrder(req).map((need, i) => ({ label: label(need), met: met[i] ?? false })) };
      }}
      option={(id) => view.actions.find(({ action: a }) => a.type === "research" && a.equipment === terminal.id && a.research === id)}
      work={(id, option) => {
        // With the toggle on, Progress sends a Mush's own spoil, a sample sure to fail its assay, so 0% (docs/plans/archive/research-sabotage.md).
        // Off, the odds the sample survives its assay.
        if (!spoilOn) return { option, chance: 1 - view.config.researchSpoilChance };
        const spoil = spoilFor(id);
        return spoil ? { option: spoil, chance: 0 } : null;
      }}
      more={(id) => {
        // Saboteur's Contaminate, beside Progress when the view offers it.
        const option = view.actions.find(({ action: a }) => a.type === "contaminate" && a.equipment === terminal.id && a.research === id);
        return option ? [{ option, label: t("research.contaminate"), hint: gainHint(t, undefined, option.chance) }] : [];
      }}
      view={view}
      onAction={onAction}
    />
  );
}

function ProjectList({ terminal, view, onAction }: ListProps) {
  const { t } = useTranslation();
  const names = useNames();
  const discarded = new Set(view.discardedProjects);
  const ids = PROJECT_IDS.filter((id) => (view.projects[id] ?? 0) >= PROJECT_COMPLETE || id in view.relay.projects || discarded.has(id));
  return (
    <ProgressList
      label={t("projects.title")}
      ids={ids}
      progress={view.projects}
      relay={view.relay.projects}
      complete={PROJECT_COMPLETE}
      cards={PROJECT_CARDS}
      name={names.project}
      desc={(id) => t(`projects.desc.${id}`, { defaultValue: "" }) || undefined}
      unimplemented={(id) => projectStatus(id) === "none"}
      unimplementedLabel={t("projects.unimplemented")}
      discarded={(id) => discarded.has(id)}
      discardedLabel={t("projects.discarded")}
      describeFinished
      needs={(id) => {
        const skills = PROJECTS.find((p) => p.id === id)?.skills ?? [];
        // Only the worker's own skills speed up their work (relay.ts), so yours are the ones checked.
        return skills.length ? { items: skills.map((skill) => ({ label: names.skill(skill), met: hasSkill(view.you, skill), skill })) } : null;
      }}
      option={(id) => view.actions.find(({ action: a }) => a.type === "project" && a.equipment === terminal.id && a.project === id)}
      view={view}
      onAction={onAction}
    />
  );
}

/**
 * PILGRED's repair: its card on the left (hover, focus or tap for the description), and beside it the progress bar (sent only
 * to people at the terminal) over, when the view offers it, the repair as one big button (as Return to Sol). Relay tokens below.
 */
function PilgredRepair({ terminal, view, onAction, onSharePilgred }: ListProps) {
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const refocusShare = useRef(false);
  const percent = view.pilgred ?? 0;
  const option = view.actions.find(({ action: a }) => a.type === "repair_pilgred" && a.equipment === terminal.id);

  if (sharing && onSharePilgred) {
    return (
      <SharePilgredForm
        initialPercent={percent}
        onPost={(sharedPercent, text) => {
          onSharePilgred(sharedPercent, text);
          setSharing(false);
        }}
        onBack={() => {
          refocusShare.current = true;
          setSharing(false);
        }}
      />
    );
  }

  return (
    <div className="pilgred-repair" role="group" aria-label={t("pilgred.label")}>
      <EntryTip name={t("pilgred.label")} desc={t("pilgred.desc")} trigger={<img className="research-card" src={PILGRED_CARD} alt={t("pilgred.label")} />} />
      <div className="pilgred-controls">
        <div className="research-progress">
          <ProgressBar
            label={t("pilgred.label")}
            percent={percent}
            complete={PILGRED_COMPLETE}
            pending={undefined}
            style={{ "--value": Math.min(1, percent / PILGRED_COMPLETE) } as CSSProperties}
          />
          <span>{t("research.percent", { percent })}</span>
        </div>
        {option && (
          <ActionButton className="big" view={view} option={option} onAction={onAction} hint={t("relay.help")}>
            <ActionLabel text={withGain(t, t("actions.repairPilgred"), view.relay.pilgred?.gain)} cost={option.cost} chance={option.chance} />
          </ActionButton>
        )}
      </div>
      <div className="pilgred-relay">
        <RelayDetails target={view.relay.pilgred ?? undefined} view={view} />
      </div>
      {onSharePilgred && view.canSharePilgred && (
        <div className="pilgred-share-actions">
          <button
            type="button"
            ref={(el) => {
              if (el && refocusShare.current) {
                refocusShare.current = false;
                el.focus();
              }
            }}
            onClick={() => setSharing(true)}
          >
            {t("pilgred.share")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Editable share form inside the PILGRED terminal window (mirrors SharePlantsForm). */
function SharePilgredForm({
  initialPercent,
  onPost,
  onBack,
}: {
  initialPercent: number;
  onPost: (percent: number, text: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const [percent, setPercent] = useState(initialPercent);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <form
      className="share-planet-form share-pilgred-form"
      aria-labelledby={headingId}
      onSubmit={(e) => {
        e.preventDefault();
        onPost(percent, text);
      }}
    >
      <h3 id={headingId}>{t("pilgred.shareTitle")}</h3>
      <p className="sub">{t("pilgred.shareHint")}</p>
      <label className="share-pilgred-percent">
        <span>{t("pilgred.percentLabel")}</span>
        <input
          ref={inputRef}
          type="number"
          min={0}
          max={PILGRED_COMPLETE}
          value={percent}
          onChange={(e) => {
            const parsed = Number.parseInt(e.target.value, 10);
            const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(PILGRED_COMPLETE, parsed)) : 0;
            setPercent(clamped);
          }}
        />
      </label>
      <div className="research-progress">
        <ProgressBar
          label={t("pilgred.label")}
          percent={percent}
          complete={PILGRED_COMPLETE}
          pending={undefined}
          style={{ "--value": Math.min(1, percent / PILGRED_COMPLETE) } as CSSProperties}
        />
        <span>{t("research.percent", { percent })}</span>
      </div>
      <p className="sub share-planet-disclaimer">{t("pilgred.shareDisclaimer")}</p>
      <label className="share-planet-text">
        <span>{t("pilgred.noteLabel")}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_SHARED_PILGRED_TEXT_LENGTH}
          rows={3}
          placeholder={t("pilgred.notePlaceholder")}
        />
      </label>
      <span className="sub share-planet-count" aria-hidden="true">
        {text.length}/{MAX_SHARED_PILGRED_TEXT_LENGTH}
      </span>
      <div className="share-planet-buttons">
        <button type="button" onClick={onBack}>
          {t("astro.back")}
        </button>
        <button type="submit">{t("pilgred.sharePost")}</button>
      </div>
    </form>
  );
}

/** The Drug Dispenser: the drugs the view offers you (the first N of its list; the server picks them), as a list like the projects, each with its icon and what consuming it does (or why you can't tell). */
function DrugDispenser({ terminal, view, onAction }: ListProps) {
  const { t } = useTranslation();
  const names = useNames();
  const options = view.actions.flatMap((option) => (option.action.type === "dispense_drug" && option.action.equipment === terminal.id ? [{ drug: option.action.drug, option }] : []));
  return (
    <div className="drug-dispenser" role="group" aria-label={t("drugDispenser.label")}>
      {options.length === 0 ? (
        <p>{t("drugDispenser.none")}</p>
      ) : (
        <ul className="research-list" aria-label={t("drugDispenser.label")}>
          {options.map(({ drug, option }) => {
            const icon = itemIcon(drug);
            return (
              <li key={drug} className="research-item research-item-active">
                {icon && <img className="research-card" src={icon} alt="" />}
                <div className="research-title">
                  <strong>{names.item(drug)}</strong>
                </div>
                <div className="research-body">
                  <ConsumeEffects type={drug} view={view} />
                  <ActionButton view={view} option={option} onAction={onAction}>
                    <ActionLabel text={t("drugDispenser.take", { item: names.item(drug) })} cost={option.cost} chance={option.chance} />
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface Checklist {
  /** With `skill` (a project's skills), the entry is the box and the skill's icon, its name and description in the skill popover, with no text. */
  items: { label: string; met: boolean; skill?: string }[];
}

interface ProgressListProps {
  label: string;
  /** Shown at the top of every tab's panel, scrolling with the list (research: basics and the spoil toggle). */
  intro?: React.ReactNode;
  ids: readonly string[];
  progress: Record<string, number>;
  /** Each target's relay pool, from the view (only in its room). */
  relay: Record<string, RelayTargetView>;
  complete: number;
  /** Where the bar splits into segments (research: its assay marks, so each quarter is its own bar). */
  marks?: readonly number[];
  cards: Record<string, string>;
  name: (id: string) => string;
  /** The description shown on hover, if the entry has one. */
  desc?: (id: string) => string | undefined;
  /** Entries the rules don't implement, moved out of the other tabs into a last Unimplemented tab, shown only on desktop. */
  unimplemented?: (id: string) => boolean;
  /** That tab's name, when the research one doesn't fit (French and Spanish agree it with the noun). */
  unimplementedLabel?: string;
  /** Entries that will never be available again (projects the view lists as discarded), in a Discarded tab after Done. */
  discarded?: (id: string) => boolean;
  discardedLabel?: string;
  /** Done and discarded rows show the entry's description as a caption instead of "Complete" (projects). */
  describeFinished?: boolean;
  /** The view's offer to work on this entry, if any. */
  /** A checklist under an item: for research what must be in the lab before it can be worked on, for projects the skills that speed it up (the button itself comes from `view.actions`). */
  needs?: (id: string) => Checklist | null;
  option: (id: string) => ActionOption | undefined;
  /**
   * What the work button sends and the success chance it always shows (research: Progress, or the spoil while the toggle
   * is on, at 0%; null hides the button). Without it the button sends `option` and shows its chance only when it can fail.
   */
  work?: (id: string, option: ActionOption) => { option: ActionOption; chance: number } | null;
  /** Other buttons beside the work button, from the view's offers (research: Contaminate), with their tooltip text. */
  more?: (id: string) => { option: ActionOption; label: string; hint?: string | undefined }[];
  view: PlayerView;
  onAction: (action: Action) => void;
}

/** Wraps an entry's name or card: hovering (or tapping) the trigger shows what the entry does. */
export function EntryTip({ name, desc, trigger, children }: { name: string; desc?: string; trigger: React.ReactElement; children?: React.ReactNode }) {
  if (!desc) return React.cloneElement(trigger, undefined, children);
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} nativeButton={false} render={trigger} className="has-tip">
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
 * Each segment's share of a bar split at `marks` (research's assay marks): how much of it is filled (`--value`) and how
 * much of it is pending samples (`--pending`, drawn right after the fill), each 0 to 1 of that segment.
 */
function segmentStyles(marks: readonly number[], percent: number, pending: number): CSSProperties[] {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return marks.map((hi, i) => {
    const lo = i === 0 ? 0 : marks[i - 1]!;
    const span = hi - lo;
    const value = clamp((percent - lo) / span);
    const pend = clamp((Math.min(percent + pending, hi) - Math.max(percent, lo)) / span);
    return { "--value": value, "--pending": pend } as CSSProperties;
  });
}

/**
 * A research or project's progress bar. With samples pending their assay, the bar is the trigger for a tooltip saying how
 * much is pending (hover, focus or tap), so the percent beside it stays short and never wraps. With `segments` it is a row
 * of separate bars with a hairline gap between them (research: one per assay mark), still one progressbar to assistive tech.
 */
function ProgressBar({
  label,
  percent,
  complete,
  pending,
  style,
  segments,
}: {
  label: string;
  percent: number;
  complete: number;
  pending: string | undefined;
  style: CSSProperties;
  segments?: CSSProperties[] | undefined;
}) {
  const className = segments ? "progress-segments" : "kit-progress neron";
  const children = segments?.map((segment, i) => <div key={i} className="kit-progress neron" style={segment} />);
  if (!pending)
    return (
      <div className={className} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={complete} aria-valuenow={percent} style={segments ? undefined : style}>
        {children}
      </div>
    );
  return (
    <Popover.Root>
      {/* Base UI makes a non-native trigger focusable itself, so keyboard users can open it too. */}
      <Popover.Trigger
        openOnHover
        delay={200}
        nativeButton={false}
        render={<div />}
        className={`${className} has-pending`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={complete}
        aria-valuenow={percent}
        aria-valuetext={pending}
        style={segments ? undefined : style}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip">{pending}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

type ProgressTab = "active" | "blocked" | "done" | "discarded" | "unimplemented";
const PROGRESS_TABS: readonly ProgressTab[] = ["active", "blocked", "done", "discarded", "unimplemented"];

/**
 * Every research or project with its progress (only in its room until complete), its relay tokens and, when the view offers it, a button to work on it, in three
 * tabs: Active (in progress, then available), Blocked (not offered by the view, so for research the lab misses a need)
 * and Done, then (projects) Discarded, the ones that will never be available again, plus (desktop only) a last
 * Unimplemented tab holding the entries the rules don't implement, which then appear in no other tab; on the phone
 * layout they are hidden. Within a tab the order is the list's own. Empty tabs other than Active are left out.
 */
function ProgressList({ label, intro, ids, progress, relay, complete, marks, cards, name, desc, unimplemented, unimplementedLabel, discarded, discardedLabel, describeFinished = false, needs, option: optionFor, work, more, view, onAction }: ProgressListProps) {
  const { t } = useTranslation();
  const mobile = useMobile();
  const [tab, setTab] = useState<ProgressTab>("active");
  const allRows = ids.map((id) => ({ id, percent: progress[id] ?? 0, option: optionFor(id), discarded: discarded?.(id) ?? false }));
  const rows = unimplemented ? allRows.filter((r) => !unimplemented(r.id)) : allRows;
  const open = rows.filter((r) => !r.discarded);
  const pendingOf = (id: string) => relay[id]?.pending ?? 0;
  const groups: Record<ProgressTab, typeof rows> = {
    active: [...open.filter((r) => r.percent > 0 && r.percent < complete && r.option), ...open.filter((r) => r.percent === 0 && r.option)],
    blocked: open.filter((r) => r.percent < complete && !r.option),
    done: open.filter((r) => r.percent >= complete),
    discarded: rows.filter((r) => r.discarded),
    unimplemented: unimplemented && !mobile ? allRows.filter((r) => unimplemented(r.id)) : [],
  };
  const shown = PROGRESS_TABS.filter((key) => key === "active" || groups[key].length > 0);
  const current = shown.includes(tab) ? tab : "active";
  const tabLabel = (key: ProgressTab) =>
    key === "discarded" ? (discardedLabel ?? "") : (key === "unimplemented" && unimplementedLabel) || t(`research.tabs.${key}`);
  return (
    <Tabs.Root className="settings-tabs" value={current} onValueChange={(value) => setTab(value as ProgressTab)}>
      <Tabs.List className={unimplemented ? "settings-tab-list progress-tab-list unimplemented-tab-list" : "settings-tab-list progress-tab-list"} aria-label={label}>
        {shown.map((key) => (
          <Tabs.Tab key={key} className="settings-tab" value={key}>
            {tabLabel(key)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {shown.map((key) => (
        <Tabs.Panel key={key} value={key}>
          {intro && <div className="progress-intro">{intro}</div>}
          {groups[key].length === 0 ? (
            <p>{t("research.none")}</p>
          ) : (
            <ul className="research-list" aria-label={tabLabel(key)}>
              {groups[key].map(({ id, percent, option, discarded: gone }) => {
                const card = cards[id.toLowerCase()];
                // The Unimplemented tab mixes them all, so each row takes its look from its own state.
                const kind = gone ? "discarded" : percent >= complete ? "done" : option ? "active" : "blocked";
                const finished = kind === "done" || kind === "discarded";
                const needed = !finished ? needs?.(id) : null;
                const extras = !finished ? (more?.(id) ?? []) : [];
                const caption = describeFinished ? desc?.(id) : undefined;
                const button = option && (work ? work(id, option) : { option, chance: option.chance });
                return (
                  <li key={id} className={`research-item research-item-${kind}`}>
                    {card && <EntryTip name={name(id)} desc={desc?.(id)} trigger={<img className="research-card" src={card} alt="" />} />}
                    <div className="research-title">
                      <EntryTip name={name(id)} desc={desc?.(id)} trigger={<strong />}>{name(id)}</EntryTip>
                    </div>
                    {/* The percent at the title row's right edge. */}
                    {!finished && <span className="research-percent">{t("research.percent", { percent })}</span>}
                    <div className="research-body">
                      {finished ? (
                        caption ? (
                          <p className="sub research-caption">{caption}</p>
                        ) : (
                          kind === "done" && <span>{t("research.done")}</span>
                        )
                      ) : (
                        <div className="research-progress">
                          {/* Research: solid for verified progress, striped for pending samples not yet assayed (docs/plans/archive/research-sabotage.md). */}
                          <ProgressBar
                            label={name(id)}
                            percent={percent}
                            complete={complete}
                            pending={pendingOf(id) ? t("research.withPending", { percent, pending: pendingOf(id) }) : undefined}
                            style={{ "--value": Math.min(1, percent / complete), "--pending": Math.min(1, pendingOf(id) / complete) } as CSSProperties}
                            segments={marks && segmentStyles(marks, percent, pendingOf(id))}
                          />
                        </div>
                      )}
                      <RelayDetails target={relay[id]} view={view} />
                    </div>
                    {/* Under the bar: what the entry needs (its checklist) on the left, then the work button (and spoil, Contaminate) at the right,
                      wrapping as the row needs; what a button adds and its odds are in its tooltip. */}
                    {(needed || (!finished && (option || extras.length > 0))) && (
                      <div className="research-footer">
                        {needed && (
                          <div className="research-needs">
                            <ul>
                              {needed.items.map(({ label, met, skill }) => (
                                <li key={label} className={met ? "research-need-met" : undefined}>
                                  <img src={met ? CHECK_ICON : UNCHECK_ICON} alt={met ? t("research.met") : t("research.unmet")} />
                                  {skill ? (
                                    <SkillPopover skill={skill} className="research-need-skill" aria-label={label}>
                                      <img src={skillIcon(skill)} alt="" />
                                    </SkillPopover>
                                  ) : (
                                    label
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {!finished && (option || extras.length > 0) && (
                          <span className="research-actions">
                            {button && (
                              <ActionButton key={button.option.action.type} view={view} option={button.option} onAction={onAction} hint={gainHint(t, relay[id]?.gain, button.option.chance)}>
                                <ActionLabel text={t("research.work")} cost={button.option.cost} chance={button.chance} showChance={!!work} />
                              </ActionButton>
                            )}
                            {extras.map(({ option: extra, label: text, hint }) => (
                              <ActionButton key={extra.action.type} view={view} option={extra} onAction={onAction} hint={hint}>
                                <ActionLabel text={text} cost={extra.cost} chance={extra.chance} />
                              </ActionButton>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
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
