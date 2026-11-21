// Signals (owner, 2026-11-16; plan in docs/plans/signals.md): every ship or base that reaches the Daedalus is one
// signal, kept for the whole game (nothing is removed when it ends; its status changes). The Com center terminal's
// Signals tab lists them, and each holds its conversation with the Comms Officers of the time as a feed of i18n keys.
// Only players with access to the Comms Officer title see any of it (`signalsView`), and every action on a signal is
// private. NERON announces each new signal ship-wide in crew chat (owner, 2026-11-16), so the crew knows something is
// out there but not what was said.
//
// What each kind may say next is a small script (`SIGNAL_SCRIPTS`): steps, each with the options offered there. It is
// plain data, so branching dialogue later is new steps, not new code. Built so far: merchants (merchants.ts) and rebel
// bases (comms.ts: each decode is one exchange, the base's message clearer each time). Distress calls and information
// ships come later (docs/plans/signals.md).

import type { CharacterId } from "./characters.ts";
import type { RebelBaseId } from "./comms.ts";
import { type DealBlock, dealBlock, dealProjectCount, type MerchantDeal, type MerchantKind } from "./merchants.ts";
import { tradableProjects } from "./projectEffects.ts";
import type { ProjectId } from "./projects.ts";
import { hasTitleAccess } from "./titles.ts";
import type { GameState, LogParams, PlayerState } from "./types.ts";

/** The kinds of signal built so far. Distress calls and information ships come later. */
export const SIGNAL_KINDS = ["merchant", "rebel"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * `active`: can still be talked to. The rest are history: `deal` (a deal was made), `refused` (No thank you), `reached`
 * (a rebel base decoded to 100%) and `lost` (it left, expired or the ship moved on, contacted or not).
 */
export const SIGNAL_STATUSES = ["active", "deal", "refused", "reached", "lost"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

/** One message. Stored as an i18n key and parameters, never as text, so every viewer reads it in their own language. */
export interface FeedEntry {
  from: "officer" | "signal" | "system";
  /** The cycle it was said. */
  at: number;
  /**
   * Who spoke, for officer lines: the title changes hands, and a new officer reads who made which deal. Always the
   * Comms Officer of the time, even when a hacker acted (owner, 2026-11-16: they sign as the officer). The client shows
   * it as a username (`characterUsername`: "prinaldo").
   */
  officer?: CharacterId;
  key: string;
  params?: LogParams;
  /** This message ended the conversation. */
  closes?: true;
}

/** What a merchant signal carries (merchants.ts): its ship's kind, the hail it came with, and its rolled deals. */
export interface MerchantData {
  kind: MerchantKind;
  /** The original's `trade_events` id: which hail and which deals. */
  event: string;
  deals: MerchantDeal[];
}

/** What a rebel signal carries (comms.ts): which base calls, and how much of its message is decoded (0 to 100). */
export interface RebelData {
  base: RebelBaseId;
  progress: number;
}

export interface Signal {
  /** `signal-3`. */
  id: string;
  kind: SignalKind;
  /** The cycle it arrived. */
  arrivedAt: number;
  /** The first cycle it can't be reached any more (a merchant's stay is over, a rebel call's window has closed). */
  endsAt: number;
  status: SignalStatus;
  /** The current step of its kind's script (`SIGNAL_SCRIPTS`). */
  step: string;
  /** The number after its name when another of the same kind was active as it arrived ("Transport 2"); 1 otherwise. Interim (owner, 2026-11-16). */
  number: number;
  /** The conversation, oldest first. */
  feed: FeedEntry[];
  merchant?: MerchantData;
  rebel?: RebelData;
}

export interface SignalsState {
  list: Signal[];
  nextId: number;
}

export const newSignals = (): SignalsState => ({ list: [], nextId: 1 });

/**
 * One option at a script step. `contact` starts the dialogue (`contact_signal`); `deal` is one button per deal
 * (`close_deal`); `refuse` is No thank you (`refuse_signal`); `decode` decodes a rebel base's message further
 * (`decode_rebel`). Later kinds add replies that move to another step and claims that stay disabled until a condition
 * holds (docs/plans/signals.md).
 */
export type SignalOption = { kind: "contact"; next: string } | { kind: "deal" } | { kind: "refuse" } | { kind: "decode" };

export interface SignalScript {
  start: string;
  steps: Record<string, readonly SignalOption[]>;
}

/**
 * Each kind's dialogue. A merchant: hail (Contact) → offers (each deal, No thank you) → closed. A rebel base: decoding
 * (Decode, again and again) → reached at 100%. Rebels skip Contact (owner, 2026-11-16).
 */
export const SIGNAL_SCRIPTS: Record<SignalKind, SignalScript> = {
  merchant: {
    start: "hail",
    steps: {
      hail: [{ kind: "contact", next: "offers" }],
      offers: [{ kind: "deal" }, { kind: "refuse" }],
    },
  },
  rebel: {
    start: "decoding",
    steps: {
      decoding: [{ kind: "decode" }],
    },
  },
};

/** The option of `kind` the signal offers at its current step, if it is active and offers one. */
export function signalOption<K extends SignalOption["kind"]>(signal: Readonly<Signal>, kind: K): Extract<SignalOption, { kind: K }> | undefined {
  if (signal.status !== "active") return undefined;
  const options = SIGNAL_SCRIPTS[signal.kind].steps[signal.step] ?? [];
  return options.find((o): o is Extract<SignalOption, { kind: K }> => o.kind === kind);
}

/** Whether a signal (or its view) can still be talked to. */
export const isActiveSignal = (s: Readonly<Pick<Signal, "status">>): boolean => s.status === "active";

export const findSignal = (state: Readonly<GameState>, id: string): Signal | undefined => state.signals.list.find((s) => s.id === id) as Signal | undefined;

/** Adds a signal of `kind`, active at its script's start. Mutates a state the caller already cloned. */
export function addSignal(state: GameState, kind: SignalKind, endsAt: number, data: Pick<Signal, "merchant" | "rebel">): Signal {
  const taken = new Set(state.signals.list.filter((s) => s.status === "active" && s.kind === kind && sameSubkind(s, data)).map((s) => s.number));
  let number = 1;
  while (taken.has(number)) number++;
  const signal: Signal = {
    id: `signal-${state.signals.nextId++}`,
    kind,
    arrivedAt: state.cycle,
    endsAt,
    status: "active",
    step: SIGNAL_SCRIPTS[kind].start,
    number,
    feed: [],
    ...data,
  };
  state.signals.list.push(signal);
  return signal;
}

/** Two signals share a name: same kind, and the same merchant ship kind or the same rebel base. */
const sameSubkind = (s: Readonly<Signal>, data: Pick<Signal, "merchant" | "rebel">): boolean =>
  s.merchant?.kind === data.merchant?.kind && s.rebel?.base === data.rebel?.base;

/** Appends a message to the feed, said now. Mutates a state the caller already cloned. */
export function say(state: Readonly<GameState>, signal: Signal, entry: Omit<FeedEntry, "at">): void {
  signal.feed.push({ ...entry, at: state.cycle });
}

/**
 * An officer's line, signed by whoever holds the Comms Officer title now: someone using a hacked terminal (or a cheat)
 * speaks as the officer (owner, 2026-11-16). Only with the title vacant does `actor` sign it.
 */
export function officerSays(state: Readonly<GameState>, signal: Signal, actor: Readonly<PlayerState>, key: string, params?: LogParams): void {
  say(state, signal, { from: "officer", officer: signingOfficer(state, actor).character, key, ...(params && { params }) });
}

/** Who an officer line from `actor` is signed by: the Comms Officer if there is one, else `actor`. */
export function signingOfficer(state: Readonly<GameState>, actor: Readonly<PlayerState>): Readonly<PlayerState> {
  const holder = state.titles.comms_officer;
  return (holder !== null && state.players.find((p) => p.id === holder)) || actor;
}

/** Ends an active signal with `status`; `closing` is the message that closes it. Mutates a state the caller already cloned. */
export function closeSignal(state: Readonly<GameState>, signal: Signal, status: Exclude<SignalStatus, "active">, closing: Omit<FeedEntry, "at" | "closes">): void {
  say(state, signal, { ...closing, closes: true });
  signal.status = status;
}

/** The signal can't be reached any more (it left, or the ship moved on): `lost`, with a "Signal lost" line. */
export function loseSignal(state: Readonly<GameState>, signal: Signal): void {
  if (signal.status === "active") closeSignal(state, signal, "lost", { from: "system", key: "signals.lost" });
}

/**
 * The signal's name: its kind's ("Transport") or its base's ("Black Mages of Sirius"), with a number after it when
 * another of the same name was active as it arrived.
 */
export function signalName(signal: Readonly<Signal>): { key: string; params?: LogParams } {
  if (signal.rebel) return { key: `comms.rebels.${signal.rebel.base}.name` };
  const key = signal.merchant ? `signals.names.merchant.${signal.merchant.kind}` : `signals.names.${signal.kind}`;
  return signal.number > 1 ? { key: `${key}_numbered`, params: { n: signal.number } } : { key };
}

/** A signal as the Signals tab shows it. Only ever built for a viewer with Comms Officer access (`signalsView`). */
export interface SignalView {
  id: string;
  kind: SignalKind;
  name: { key: string; params?: LogParams };
  status: SignalStatus;
  arrivedAt: number;
  endsAt: number;
  feed: FeedEntry[];
  /**
   * A merchant's ship kind, hail and deals, in order. `blocked` is why the viewer can't close that deal now, null if
   * they can (always null once the signal is inactive). The buttons themselves come from `view.actions`. `projects`:
   * the finished projects the officer may pick for a deal that takes some (TECHNO_REWRITE), while it is active.
   */
  merchant?: { kind: MerchantKind; event: string; deals: (MerchantDeal & { blocked: DealBlock | null })[]; projects?: ProjectId[] };
  /** A rebel base's call: which base and how much is decoded. Each of its feed's messages carries the progress it was said at. */
  rebel?: RebelData;
}

/**
 * The Signals tab for `viewer`, oldest first, or undefined without access to the Comms Officer title (owner,
 * 2026-11-16: non-officers see nothing at all, not even a count). A new officer reads every old conversation.
 */
export function signalsView(state: Readonly<GameState>, viewer: Readonly<PlayerState>): SignalView[] | undefined {
  if (!hasTitleAccess(state, viewer, "comms_officer")) return undefined;
  return state.signals.list.map((s) => ({
    id: s.id,
    kind: s.kind,
    name: signalName(s),
    status: s.status,
    arrivedAt: s.arrivedAt,
    endsAt: s.endsAt,
    feed: s.feed.map((e) => ({ ...e, ...(e.params && { params: { ...e.params } }) })),
    ...(s.merchant && {
      merchant: {
        kind: s.merchant.kind,
        event: s.merchant.event,
        deals: s.merchant.deals.map((deal) => ({
          give: deal.give.map((a) => ({ ...a })),
          receive: deal.receive.map((a) => ({ ...a })),
          ...(deal.skill && { skill: deal.skill }),
          blocked: s.status === "active" ? dealBlock(state, viewer, deal) : null,
        })),
        // Finished projects are public (the completed list), so this tells the officer nothing new.
        ...(s.status === "active" && s.merchant.deals.some((d) => dealProjectCount(d) > 0) && { projects: tradableProjects(state) }),
      },
    }),
    ...(s.rebel && { rebel: { ...s.rebel } }),
  }));
}
