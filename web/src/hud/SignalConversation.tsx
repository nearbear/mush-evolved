// One signal's conversation (docs/plans/signals.md), opened from the Signals tab (Signals.tsx): the name and time left
// with a back button at the top right, the audio wave, then one feed that reads like global chat (owner, 2026-11-16:
// cycle dividers, the officer's sprite and name on the left, the signal's icon and name on the right), starting at the
// bottom, with the options under its last line in the same scroll area.
//
// The other side's answers are paced for show only (owner, 2026-11-16): the server records them at once, but a reply
// that arrives while the conversation is open waits 3 s ("incoming…"), then types out with the wave moving, and the
// options come back once it has finished. Tapping the feed shows the message whole; the wait can't be skipped. What is
// already in the feed when the conversation opens is shown whole, so a reload or a new officer reads the history at once.
// Every option is from view.actions (`contact_signal`, `close_deal`, `refuse_signal`); a deal without one is drawn
// disabled with the reason the rules give (`blocked`).

import { type Action, type ActionOption, characterUsername, type FeedEntry as SignalFeedEntry, isActiveSignal, type PlayerView, type SignalView } from "@mush2/shared";
import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FACTION_ICONS, itemIcon, SHIP_RESOURCE_ICONS, skillIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { AudioWave } from "./AudioWave.tsx";
import { UnavailableButton } from "./CommandTerminal.tsx";
import { CycleDivider } from "./CycleDivider.tsx";
import { CrewAvatar, FeedEntry, InfoMarker } from "./FeedEntry.tsx";
import { Hint } from "./IconButton.tsx";
import { ItemFace } from "./ItemFace.tsx";
import { Scroller } from "./Scroller.tsx";
import { SignalIcon, useSignalName } from "./Signals.tsx";
import { nextPlayback, type Playback, skipPlayback } from "./signalPlayback.ts";

type Deal = NonNullable<SignalView["merchant"]>["deals"][number];
type Asset = Deal["give"][number] | Deal["receive"][number];

interface Props {
  signal: SignalView;
  terminalId: string;
  view: PlayerView;
  onAction: (action: Action) => void;
  onBack: () => void;
}

export function SignalConversation({ signal, terminalId, view, onAction, onBack }: Props) {
  const { t } = useTranslation();
  const name = useSignalName(signal);
  const text = useFeedText(signal);
  const texts = signal.feed.map(text);
  const [playback, setPlayback] = useState<Playback>(() => ({ shown: signal.feed.length, phase: "idle", chars: 0 }));

  // Drives the playback: one step now, or after the reply delay, or after one character.
  const step = nextPlayback(playback, signal.feed, texts);
  const stepRef = useRef(step);
  stepRef.current = step;
  const stepKey = step && `${step.next.shown}:${step.next.phase}:${step.next.chars}:${step.after}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the step is read through a ref; its key says when it changed.
  useEffect(() => {
    const next = stepRef.current;
    if (!next) return;
    const timer = setTimeout(() => setPlayback(next.next), next.after);
    return () => clearTimeout(timer);
  }, [stepKey]);

  const skip = () => setPlayback(skipPlayback);
  const pending = playback.shown < signal.feed.length;
  const active = isActiveSignal(signal);
  const visible = signal.feed.slice(0, playback.shown);
  const current = playback.phase === "typing" ? signal.feed[playback.shown] : undefined;
  const waiting = playback.phase === "waiting" ? signal.feed[playback.shown] : undefined;
  const cycles = view.config.cyclesPerDay;
  // The cycle of the row before index `i` of what is drawn (visible lines, then the one typing or waiting).
  const cycleBefore = (i: number) => (i === 0 ? undefined : signal.feed[i - 1]?.at);

  return (
    <section className="signal-conversation" aria-label={name}>
      <header className="signal-head">
        <div className="signal-head-text">
          <strong>{name}</strong>
          <span className="sub">
            {active ? t("signals.leaves", { count: Math.max(0, signal.endsAt - view.cycle) }) : t(`signals.status.${signal.status as Exclude<SignalView["status"], "active">}`)}
          </span>
        </div>
        <button type="button" className="signal-back" onClick={onBack}>
          {t("signals.back")}
        </button>
      </header>
      <AudioWave speaking={playback.phase === "typing" && current?.from === "signal"} />
      {/* Sticks to the bottom as lines arrive and type out, like global chat (Scroller). */}
      <Scroller items={playback.shown} scrollKey={`${playback.phase}:${playback.chars}`}>
        {/* A log, so a screen reader hears each line once, whole (the typing is aria-hidden). Tapping it, or Enter or
            Space on it, shows a reply that is typing out whole. */}
        <ol
          className="feed signal-feed"
          role="log"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs a tab stop to scroll by keyboard, and it is the skip.
          tabIndex={0}
          aria-label={t("signals.feedLabel")}
          onClick={skip}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") skip();
          }}
        >
          {visible.map((e, i) => (
            <Fragment key={i}>
              {cycleBefore(i) !== e.at && <CycleDivider cycle={e.at} cyclesPerDay={cycles} />}
              <FeedLine entry={e} signal={signal} name={name} text={texts[i]!} />
            </Fragment>
          ))}
          {(current ?? waiting) && cycleBefore(playback.shown) !== (current ?? waiting)!.at && (
            <CycleDivider cycle={(current ?? waiting)!.at} cyclesPerDay={cycles} />
          )}
          {current && (
            <FeedLine
              key={playback.shown}
              entry={current}
              signal={signal}
              name={name}
              text={texts[playback.shown]!}
              typed={Array.from(texts[playback.shown]!).slice(0, playback.chars).join("")}
            />
          )}
          {waiting && (
            <FeedEntry className="entry-signal signal-incoming" marker={<SignalIcon kind={signal.kind} />} name={<strong>{name}</strong>} at={undefined}>
              <span aria-hidden="true">{t("signals.incoming")}</span>
            </FeedEntry>
          )}
        </ol>
        {/* The options scroll with the feed, under its last line, once the reply has finished. */}
        {!pending && <SignalOptions signal={signal} terminalId={terminalId} view={view} onAction={onAction} />}
      </Scroller>
    </section>
  );
}

/**
 * One line of the feed, drawn as a global chat message: the officer with their sprite and username on the left, the
 * signal with its kind's icon and name on the right, a system line ("Signal lost") with the info icon. `typed`: the
 * part typed out so far, while it types; a screen reader gets the whole line at once.
 */
function FeedLine({ entry, signal, name, text, typed }: { entry: SignalFeedEntry; signal: SignalView; name: string; text: string; typed?: string }) {
  const body =
    typed === undefined ? (
      text
    ) : (
      <>
        <span aria-hidden="true">{typed}</span>
        <span className="sr-only">{text}</span>
      </>
    );
  if (entry.from === "officer")
    return (
      <FeedEntry marker={<CrewAvatar character={entry.officer} />} name={<strong>{characterUsername(entry.officer ?? "")}</strong>} at={undefined}>
        {body}
      </FeedEntry>
    );
  if (entry.from === "signal")
    return (
      <FeedEntry className="entry-signal" marker={<SignalIcon kind={signal.kind} />} name={<strong>{name}</strong>} at={undefined}>
        {body}
      </FeedEntry>
    );
  return (
    <FeedEntry marker={<InfoMarker />} at={undefined}>
      {body}
    </FeedEntry>
  );
}

/** A feed entry as text in the viewer's language. The officer's deal line names the deal's terms from the signal. */
function useFeedText(signal: SignalView): (e: SignalFeedEntry) => string {
  const { t } = useTranslation();
  const terms = useDealTerms();
  return (e) => {
    const deal = e.key === "signals.officer.deal" && typeof e.params?.deal === "number" ? signal.merchant?.deals[e.params.deal] : undefined;
    if (deal) return t("signals.officer.deal", terms(deal));
    return t(e.key as never, { ...e.params, defaultValue: "" }) as string;
  };
}

/** One side's asset in the viewer's language ("2 inactive crew members", "3 × Fuel capsule"). */
function useAssetText(): (a: Asset) => string {
  const { t } = useTranslation();
  const names = useNames();
  return (a) =>
    a.kind === "item"
      ? t("comms.merchants.item", { count: a.count, item: names.item(a.item) })
      : a.kind === "crew"
        ? t("comms.merchants.crew", { count: a.count })
        : a.kind === "oxygen"
          ? t("comms.merchants.oxygen", { count: a.count })
          : t("comms.merchants.fuel", { count: a.count });
}

/** A deal's two sides as lists in the viewer's language, for the officer's deal line. */
function useDealTerms(): (deal: Pick<Deal, "give" | "receive">) => { give: string; receive: string } {
  const { i18n } = useTranslation();
  const asset = useAssetText();
  const list = (parts: string[]) => new Intl.ListFormat(i18n.language, { type: "unit" }).format(parts);
  return (deal) => ({ give: list(deal.give.map(asset)), receive: list(deal.receive.map(asset)) });
}

/** The options at the signal's current step: Contact; or each deal and No deal!; or nothing once it has ended. */
function SignalOptions({ signal, terminalId, view, onAction }: Omit<Props, "onBack">) {
  const { t } = useTranslation();
  const names = useNames();
  const asset = useAssetText();
  const find = (type: "contact_signal" | "refuse_signal"): ActionOption | undefined =>
    view.actions.find(({ action: a }) => a.type === type && a.equipment === terminalId && a.signal === signal.id);
  const dealOption = (deal: number): ActionOption | undefined =>
    view.actions.find(({ action: a }) => a.type === "close_deal" && a.equipment === terminalId && a.signal === signal.id && a.deal === deal);
  if (!isActiveSignal(signal)) return <p className="sub signal-over">{t("signals.over")}</p>;
  const contact = find("contact_signal");
  const refuse = find("refuse_signal");
  const contacted = signal.feed.length > 0;
  const reason = (deal: Deal) => {
    switch (deal.blocked) {
      case "skill":
        return t("comms.merchants.blocked.skill", { skill: names.skill(deal.skill ?? "") });
      case "item": {
        const item = deal.give.find((a) => a.kind === "item");
        return t("comms.merchants.blocked.item", { item: item?.kind === "item" ? names.item(item.item) : "" });
      }
      case "crew":
      case "oxygen":
      case "fuel":
        return t(`comms.merchants.blocked.${deal.blocked}`);
      default:
        return t("comms.merchants.unavailable");
    }
  };
  return (
    <div className="signal-options" role="group" aria-label={t("signals.optionsLabel")}>
      {contact && (
        <ActionButton view={view} option={contact} onAction={onAction}>
          <ActionLabel text={t("actions.contactSignal")} cost={contact.cost} chance={contact.chance} />
        </ActionButton>
      )}
      {contacted && signal.merchant && (
        <div className="signal-deals">
          {/* The two sides' headings, once, over their columns; each side also says it to a screen reader. */}
          <div className="signal-deal-headings" aria-hidden="true">
            <span>{t("comms.merchants.give")}</span>
            <span />
            <span>{t("comms.merchants.receive")}</span>
          </div>
          <ol aria-label={t("comms.merchants.dealsLabel")}>
            {signal.merchant.deals.map((deal, i) => {
              const close = dealOption(i);
              // The skill's icon is dimmed when nobody in the officer's room has it: the rules' `blocked` says so.
              const met = deal.blocked !== "skill";
              return (
                <li key={i} className="signal-deal">
                  <DealSide label={t("comms.merchants.give")} assets={deal.give} text={asset} />
                  <span className="signal-deal-arrow" aria-hidden="true">
                    ⇄
                  </span>
                  <DealSide label={t("comms.merchants.receive")} assets={deal.receive} text={asset} />
                  {deal.skill ? (
                    <Hint label={names.skill(deal.skill)}>
                      <img
                        className="signal-deal-skill"
                        data-met={met ? "" : undefined}
                        src={skillIcon(deal.skill)}
                        alt={met ? names.skill(deal.skill) : t("comms.merchants.blocked.skill", { skill: names.skill(deal.skill) })}
                      />
                    </Hint>
                  ) : (
                    <span />
                  )}
                  {close ? (
                    <ActionButton view={view} option={close} onAction={onAction}>
                      <ActionLabel text={t("signals.deal")} cost={close.cost} chance={close.chance} />
                    </ActionButton>
                  ) : (
                    <UnavailableButton big={false} reason={reason(deal)} ap={view.config.merchantDealAp}>
                      {t("signals.deal")}
                    </UnavailableButton>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {refuse && (
        <ActionButton view={view} option={refuse} onAction={onAction} className="signal-refuse">
          <ActionLabel text={t("actions.refuseSignal")} cost={refuse.cost} chance={refuse.chance} />
        </ActionButton>
      )}
    </div>
  );
}

/**
 * One side of a deal: each asset as an item tile with its count in the corner and its words ("9 × Oxygen capsule") in
 * a tooltip and for a screen reader. Oxygen, fuel and crew show their small UI icons in the tile.
 */
function DealSide({ label, assets, text }: { label: string; assets: Asset[]; text: (a: Asset) => string }) {
  return (
    <ul className="signal-deal-side" aria-label={label}>
      {assets.map((a, i) => (
        <li key={i}>
          <Hint label={text(a)}>
            <span className="signal-deal-asset" role="img" aria-label={text(a)}>
              <ItemFace count={a.count}>
                {a.kind === "item" ? (
                  <img className="item-icon" src={itemIcon(a.item)} alt="" draggable={false} />
                ) : (
                  <span className="item-face-ui">
                    <img src={a.kind === "crew" ? FACTION_ICONS.human : SHIP_RESOURCE_ICONS[a.kind]} alt="" draggable={false} />
                  </span>
                )}
              </ItemFace>
            </span>
          </Hint>
        </li>
      ))}
    </ul>
  );
}
