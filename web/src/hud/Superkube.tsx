// The Superkube's window (#170, development only): the cheat room's testing machine. One tab per group of KUBE_OPS,
// one row per option, each sending a `kube` input. Display only: what each option does, and whether you may use it,
// is decided by applyKube on the server. The argument lists come from kubeChoices, the same lists the server checks.

import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { DEFAULT_CONFIG, KUBE_OPS, kubeChoices, type KubeChoiceSource, type KubeGroup, type KubeOpId, type PlayerView, type RoomId } from "@mush2/shared";
import { useId, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { EMPTY_SLOT_ICON, itemIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { RoomCaption, SHIP_PLAN, ShipPlanSvg } from "../scene/ShipPlanMap.tsx";
import { FramedDialog } from "./FramedDialog.tsx";

const GROUPS: readonly KubeGroup[] = ["health", "items", "travel"];
const OPS = Object.keys(KUBE_OPS) as KubeOpId[];

export type SendKube = (op: KubeOpId, arg?: string | number) => void;

/**
 * The Open button (in the Inspect panel's actions and the phone's peek bar) and the window it opens. Opening is
 * single-click, like a document's Read: it spends nothing.
 */
export function SuperkubeOpener({ view, onKube }: { view: PlayerView; onKube: SendKube }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // The view has no disease lists; the names of diseases aren't hidden, and the server checks the ship's own.
  const source: KubeChoiceSource = { rooms: view.rooms, diseases: DEFAULT_CONFIG.diseases };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>{t("kube.open")}</Dialog.Trigger>
      <FramedDialog heading={t("kube.title")} closeLabel={t("kube.close")}>
        <Tabs.Root className="settings-tabs" defaultValue="health">
          <Tabs.List className="settings-tab-list">
            {GROUPS.map((group) => (
              <Tabs.Tab key={group} className="settings-tab" value={group}>
                {t(`kube.tabs.${group}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {GROUPS.map((group) => (
            <Tabs.Panel key={group} className="settings-panel" value={group}>
              {OPS.filter((op) => KUBE_OPS[op].group === group).map((op) =>
                KUBE_OPS[op].arg === "item" ? (
                  <KubeItemPicker key={op} op={op} source={source} onKube={onKube} />
                ) : KUBE_OPS[op].arg === "room" ? (
                  <KubeTravelMap key={op} op={op} view={view} onKube={onKube} />
                ) : (
                  <KubeRow key={op} op={op} view={view} source={source} onKube={onKube} />
                ),
              )}
            </Tabs.Panel>
          ))}
        </Tabs.Root>
      </FramedDialog>
    </Dialog.Root>
  );
}

function KubeRow({ op, view, source, onKube }: { op: KubeOpId; view: PlayerView; source: KubeChoiceSource; onKube: SendKube }) {
  const { t } = useTranslation();
  const names = useNames();
  const id = useId();
  const kind = KUBE_OPS[op].arg;
  const label = t(`kube.ops.${op}`);
  // A number starts at your current value of the stat; a list at its first entry.
  const current = op === "hp" || op === "morale" || op === "ap" || op === "mp" ? view.you[op] : 0;
  const choices = kind === "none" || kind === "number" ? [] : kubeChoices(source, kind);
  const [number, setNumber] = useState(String(current));
  const [choice, setChoice] = useState(choices[0] ?? "");
  if (kind === "none") {
    return (
      <button type="button" onClick={() => onKube(op)}>
        {label}
      </button>
    );
  }
  const nameOf = (value: string) => (kind === "ailment" ? t(`status.${value}` as never, { defaultValue: value }) : kind === "item" ? names.item(value) : names.room(value));
  const parsed = Number(number);
  const valid = kind !== "number" || (number !== "" && Number.isInteger(parsed) && parsed >= 0);
  return (
    <div className="settings-row kube-row">
      <label htmlFor={id}>{label}</label>
      {kind === "number" ? (
        <input id={id} type="number" inputMode="numeric" min={0} step={1} value={number} onChange={(e) => setNumber(e.target.value)} />
      ) : (
        <select id={id} value={choice} onChange={(e) => setChoice(e.target.value)}>
          {choices.map((value) => (
            <option key={value} value={value}>
              {nameOf(value)}
            </option>
          ))}
        </select>
      )}
      <button type="button" disabled={!valid} onClick={() => onKube(op, kind === "number" ? parsed : choice)}>
        {t("kube.apply")}
      </button>
    </div>
  );
}

/** Lowercase without accents, so "epee" finds "Épée". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * An item option (Spawn) as a picker: a search field over the item names (and ids), a grid of icon tiles sorted by
 * name, and one button that sends the picked item. Picking is single-click; only the button sends.
 */
function KubeItemPicker({ op, source, onKube }: { op: KubeOpId; source: KubeChoiceSource; onKube: SendKube }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  // About a hundred items, and the panel is mounted only while its tab is open: cheap enough to build per render.
  const items = kubeChoices(source, "item")
    .map((type) => ({ type, name: names.item(type) }))
    .map((it) => ({ ...it, key: `${fold(it.name)} ${fold(it.type)}` }))
    .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  const words = fold(query).split(/\s+/).filter(Boolean);
  const shown = words.length === 0 ? items : items.filter((it) => words.every((w) => it.key.includes(w)));
  return (
    <section className="kube-items" aria-label={t(`kube.ops.${op}`)}>
      <div className="settings-row kube-row">
        <label htmlFor={searchId}>{t("kube.search")}</label>
        <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" disabled={picked === null} onClick={() => picked && onKube(op, picked)}>
          {picked ? t("kube.spawnItem", { item: names.item(picked) }) : t(`kube.ops.${op}`)}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="sub">{t("kube.noMatch")}</p>
      ) : (
        <div className="kube-item-grid">
          {shown.map((it) => (
            <button key={it.type} type="button" className="pick-tile kube-item" aria-pressed={picked === it.type} onClick={() => setPicked(it.type)}>
              <img src={itemIcon(it.type) ?? EMPTY_SLOT_ICON} alt="" aria-hidden="true" draggable={false} />
              <span>{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The Travel tab's minimap: every room on the Daedalus is clickable and teleports you there at once.
 */
function KubeTravelMap({ op, view, onKube }: { op: KubeOpId; view: PlayerView; onKube: SendKube }) {
  const { t } = useTranslation();
  const [pointed, setPointed] = useState<RoomId | null>(null);
  const people = [view.you, ...view.players];
  const reachable = new Set(SHIP_PLAN.rooms.map((r) => r.id));

  return (
    <section
      className="minimap expanded kube-minimap"
      style={{ "--cols": SHIP_PLAN.width } as CSSProperties}
      aria-label={t(`kube.ops.${op}`)}
      onPointerLeave={(e) => e.pointerType !== "touch" && setPointed(null)}
    >
      <ShipPlanSvg
        here={view.you.room}
        youId={view.you.id}
        people={people}
        unidentified={view.unidentified}
        reachable={reachable}
        burningRooms={view.burningRooms}
        pointed={pointed}
        interactive
        onPoint={setPointed}
        onSelectRoom={(room) => onKube(op, room)}
      />
      <RoomCaption
        pointed={pointed}
        here={view.you.room}
        youId={view.you.id}
        people={people}
        unidentified={view.unidentified}
        burningRooms={view.burningRooms}
        emptyText={t("kube.clickToTeleport")}
      />
    </section>
  );
}
