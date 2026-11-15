// The Superkube's window (#170, development only): the cheat room's testing machine. One tab per group of KUBE_OPS,
// one row per option, each sending a `kube` input. Display only: what each option does, and whether you may use it,
// is decided by applyKube on the server. The argument lists come from kubeChoices, the same lists the server checks.

import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { DEFAULT_CONFIG, KUBE_OPS, kubeChoices, type KubeChoiceSource, type KubeGroup, type KubeOpId, type PlayerView } from "@mush2/shared";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
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
              {OPS.filter((op) => KUBE_OPS[op].group === group).map((op) => (
                <KubeRow key={op} op={op} view={view} source={source} onKube={onKube} />
              ))}
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
