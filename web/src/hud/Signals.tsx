// The Com center terminal's Signals tab (docs/plans/signals.md): every ship or base that reached the Daedalus, as a list
// grouped into Active and Inactive. Choosing one opens its conversation (SignalConversation.tsx) in the same panel, with
// a back button. Only a player with Comms Officer access gets the signals (`view.comms.terminal.signals`, signals.ts);
// anyone else sees one line, and the tab stays so its appearing never tells a hacker their hack worked. Merchants and
// rebel bases are both signals; the next rebel base's call (`nextRebel`, officer only too) is a row under Active.

import { type Action, type CommsTerminalView, isActiveSignal, type PlayerView, type SignalView } from "@mush2/shared";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { SIGNAL_KIND_ICONS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { Hint } from "./IconButton.tsx";
import { SignalConversation } from "./SignalConversation.tsx";

interface Props {
  signals: SignalView[] | undefined;
  nextRebel?: CommsTerminalView["nextRebel"];
  terminalId: string;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function Signals({ signals, nextRebel, terminalId, view, onAction }: Props) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!signals) return <p>{t("signals.accessOnly")}</p>;
  const open = openId === null ? undefined : signals.find((s) => s.id === openId);
  if (open) return <SignalConversation key={open.id} signal={open} terminalId={terminalId} view={view} onAction={onAction} onBack={() => setOpenId(null)} />;
  if (signals.length === 0 && !nextRebel) return <p>{t("signals.none")}</p>;
  // Active: the soonest to leave first. Inactive: the latest first, since that's the history read most.
  const active = signals.filter(isActiveSignal).sort((a, b) => a.endsAt - b.endsAt);
  const inactive = signals.filter((s) => !isActiveSignal(s)).reverse();
  return (
    <div className="signal-groups">
      <SignalGroup heading={t("signals.active")} signals={active} empty={t("signals.noneActive")} cycle={view.cycle} onOpen={setOpenId}>
        {nextRebel && <NextRebel next={nextRebel} cycle={view.cycle} />}
      </SignalGroup>
      {inactive.length > 0 && <SignalGroup heading={t("signals.inactive")} signals={inactive} cycle={view.cycle} onOpen={setOpenId} />}
    </div>
  );
}

function SignalGroup({
  heading,
  signals,
  empty,
  cycle,
  onOpen,
  children,
}: { heading: string; signals: SignalView[]; empty?: string; cycle: number; onOpen: (id: string) => void; children?: ReactNode }) {
  return (
    <section className="signal-group" aria-label={heading}>
      <h3 className="signal-group-heading">{heading}</h3>
      {signals.length === 0 && empty && <p className="sub">{empty}</p>}
      {(signals.length > 0 || children) && (
        <ul className="signal-list">
          {signals.map((s) => (
            <li key={s.id}>
              <SignalEntry signal={s} cycle={cycle} onOpen={onOpen} />
            </li>
          ))}
          {children}
        </ul>
      )}
    </section>
  );
}

/** The next rebel base's call, not here yet: a row that can't be opened, with the cycles until it calls. */
function NextRebel({ next, cycle }: { next: NonNullable<CommsTerminalView["nextRebel"]>; cycle: number }) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <li className="signal-entry signal-next">
      <SignalIcon kind="rebel" />
      <strong className="signal-entry-name">{names.rebelBase(next.base)}</strong>
      <span className="signal-entry-caption">{t("signals.next", { count: Math.max(0, next.at - cycle) })}</span>
    </li>
  );
}

/** One row of the list: the kind's icon (its name in a tooltip), the name, then the time left or how it ended. One press opens it. */
function SignalEntry({ signal, cycle, onOpen }: { signal: SignalView; cycle: number; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const name = useSignalName(signal);
  const caption = useSignalCaption();
  const active = isActiveSignal(signal);
  return (
    <button type="button" className="signal-entry" data-status={signal.status} aria-label={t("signals.open", { name })} onClick={() => onOpen(signal.id)}>
      <SignalIcon kind={signal.kind} />
      <strong className="signal-entry-name">{name}</strong>
      <span className="signal-entry-caption">{caption(signal, cycle)}</span>
      {active && signal.feed.length === 0 && <span className="signal-hailing">{t("signals.hailing")}</span>}
    </button>
  );
}

/** A signal kind's icon, its name in a tooltip. Used in the list and beside the signal's lines in its conversation. */
export function SignalIcon({ kind }: { kind: SignalView["kind"] }) {
  const { t } = useTranslation();
  const label = t(`signals.kinds.${kind}`);
  return (
    <Hint label={label}>
      <img className="signal-icon" src={SIGNAL_KIND_ICONS[kind]} alt={label} />
    </Hint>
  );
}

/**
 * A signal's caption: how it ended; or, while active, the time it has left, after the share decoded for a rebel base
 * ("40% decoded. Lost in 3 cycles.").
 */
export function useSignalCaption(): (signal: SignalView, cycle: number) => string {
  const { t } = useTranslation();
  return (signal, cycle) => {
    if (!isActiveSignal(signal)) return t(`signals.status.${signal.status as Exclude<SignalView["status"], "active">}`);
    const count = Math.max(0, signal.endsAt - cycle);
    if (!signal.rebel) return t("signals.leaves", { count });
    return `${t("signals.decoded", { percent: signal.rebel.progress })} ${t("signals.expires", { count })}`;
  };
}

/** The signal's name in the viewer's language ("Transport 2"). */
export function useSignalName(signal: Pick<SignalView, "name">): string {
  const { t } = useTranslation();
  return t(signal.name.key as never, { ...signal.name.params, defaultValue: signal.name.key }) as string;
}
