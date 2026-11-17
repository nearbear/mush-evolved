// The Com center terminal's Signals tab (docs/plans/signals.md): every ship or base that reached the Daedalus, as a list
// grouped into Active and Inactive. Choosing one opens its conversation (SignalConversation.tsx) in the same panel, with
// a back button. Only a player with Comms Officer access gets the signals (`view.comms.terminal.signals`, signals.ts);
// anyone else sees one line, and the tab stays so its appearing never tells a hacker their hack worked.

import { type Action, isActiveSignal, type PlayerView, type SignalView } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SIGNAL_KIND_ICONS } from "../art/assets.ts";
import { Hint } from "./IconButton.tsx";
import { SignalConversation } from "./SignalConversation.tsx";

interface Props {
  signals: SignalView[] | undefined;
  terminalId: string;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function Signals({ signals, terminalId, view, onAction }: Props) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!signals) return <p>{t("signals.accessOnly")}</p>;
  const open = openId === null ? undefined : signals.find((s) => s.id === openId);
  if (open) return <SignalConversation key={open.id} signal={open} terminalId={terminalId} view={view} onAction={onAction} onBack={() => setOpenId(null)} />;
  if (signals.length === 0) return <p>{t("signals.none")}</p>;
  // Active: the soonest to leave first. Inactive: the latest first, since that's the history read most.
  const active = signals.filter(isActiveSignal).sort((a, b) => a.endsAt - b.endsAt);
  const inactive = signals.filter((s) => !isActiveSignal(s)).reverse();
  return (
    <div className="signal-groups">
      <SignalGroup heading={t("signals.active")} signals={active} empty={t("signals.noneActive")} cycle={view.cycle} onOpen={setOpenId} />
      {inactive.length > 0 && <SignalGroup heading={t("signals.inactive")} signals={inactive} cycle={view.cycle} onOpen={setOpenId} />}
    </div>
  );
}

function SignalGroup({ heading, signals, empty, cycle, onOpen }: { heading: string; signals: SignalView[]; empty?: string; cycle: number; onOpen: (id: string) => void }) {
  return (
    <section className="signal-group" aria-label={heading}>
      <h3 className="signal-group-heading">{heading}</h3>
      {signals.length === 0 && empty ? (
        <p className="sub">{empty}</p>
      ) : (
        <ul className="signal-list">
          {signals.map((s) => (
            <li key={s.id}>
              <SignalEntry signal={s} cycle={cycle} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One row of the list: the kind's icon (its name in a tooltip), the name, then the time left or how it ended. One press opens it. */
function SignalEntry({ signal, cycle, onOpen }: { signal: SignalView; cycle: number; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const name = useSignalName(signal);
  const active = isActiveSignal(signal);
  return (
    <button type="button" className="signal-entry" data-status={signal.status} aria-label={t("signals.open", { name })} onClick={() => onOpen(signal.id)}>
      <SignalIcon kind={signal.kind} />
      <strong className="signal-entry-name">{name}</strong>
      <span className="signal-entry-caption">
        {active ? t("signals.leaves", { count: Math.max(0, signal.endsAt - cycle) }) : t(`signals.status.${signal.status as Exclude<SignalView["status"], "active">}`)}
      </span>
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

/** The signal's name in the viewer's language ("Transport 2"). */
export function useSignalName(signal: Pick<SignalView, "name">): string {
  const { t } = useTranslation();
  return t(signal.name.key as never, { ...signal.name.params, defaultValue: signal.name.key }) as string;
}
