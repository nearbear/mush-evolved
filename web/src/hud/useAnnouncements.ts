// Turns each new PlayerView into screen-reader announcements (see announce.ts for the channels and
// batching). Everything announced is already in the view: the server sent this player the entries,
// so a private entry is only ever spoken to the player it belongs to.

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FEATURE_CHANNELS, MUSH_CHANNEL, GRAVEYARD_CHANNEL, type ChannelId, type ChatLine, type FeatureChannel, type PlayerView } from "@mush2/shared";
import { announce, freshIn, getVerbosity, isUrgent, unreadToAnnounce, type Seen } from "../announce.ts";
import { useChatReadStore } from "../chatRead.ts";
import { useNames } from "../i18n/names.ts";
import { isNeronMessage } from "./FeedEntry.tsx";

/** The channel's name for a reader: "Global chat", "Botany", the thread's or private channel's own name. */
export function useChannelLabel(view: PlayerView): (channel: ChannelId) => string {
  const { t } = useTranslation();
  return (channel) => {
    if (channel === "global") return t("itrackie.tabs.global");
    if (channel === MUSH_CHANNEL) return t("itrackie.tabs.mush");
    if (channel === GRAVEYARD_CHANNEL) return t("itrackie.tabs.graveyard");
    if ((FEATURE_CHANNELS as readonly string[]).includes(channel)) return t(`itrackie.features.${channel as FeatureChannel}`);
    // A shared planet's thread goes by the planet's name, a report's by its text's first line, as in the features' lists.
    const shared = view.sharedPlanets.find((e) => e.id === channel)?.name ?? view.sharedReports.find((e) => e.id === channel)?.text.split("\n", 1)[0];
    return view.threads.find((th) => th.id === channel)?.name ?? view.privateChannels.find((c) => c.id === channel)?.name ?? shared ?? channel;
  };
}

/**
 * `reading` is the channel on screen in the iTrackie, if any: its messages are read out in full, other channels only
 * counted. "Arrived" (`freshIn`) decides when to speak; the count spoken is the channel's unread from the read store
 * (#400), the same number as its badge. `quiet` reads nothing out (a replay), while still keeping track of what has been seen.
 */
export function useAnnouncements(view: PlayerView, reading: ChannelId | null, quiet = false): void {
  const { t } = useTranslation();
  const names = useNames();
  const label = useChannelLabel(view);
  const store = useChatReadStore();
  const seen = useRef<Seen | null>(null);
  // The effect runs per view; the helpers are read through a ref so it needn't re-run when they change identity.
  const latest = useRef({ t, names, label, reading, quiet, store });
  latest.current = { t, names, label, reading, quiet, store };

  useEffect(() => {
    const fresh = freshIn(seen.current, view);
    seen.current = fresh.seen;
    if (latest.current.quiet) return;
    const { t, names, label, reading, store } = latest.current;
    const verbosity = getVerbosity();

    if (verbosity === "all" && fresh.cycle !== undefined) announce(t("announce.cycle", { cycle: fresh.cycle }));

    for (const e of fresh.log) {
      if (verbosity === "off") break;
      const line = !e.kind && e.level !== "warning" && e.level !== "danger" && isNeronMessage(e.key) ? `NERON: ${names.logLine(e)}` : names.logLine(e);
      if (isUrgent(e)) announce(line, "assertive");
      else if (verbosity === "all" || e.visibleTo !== "all") announce(line);
    }

    const myName = names.characterGiven(view.you.character).toLowerCase();
    const counts = new Map<ChannelId, number>();
    for (const m of fresh.chat) {
      if (!m.system && m.from === view.you.id) {
        announce(t("announce.sent"));
        continue;
      }
      if (verbosity === "off") continue;
      const own = m.channel === MUSH_CHANNEL || m.channel.startsWith("pc-");
      const mention = !m.system && myName !== "" && m.text.toLowerCase().includes(myName);
      if (verbosity === "mentions" && !own && !mention) continue;
      if (m.channel === reading || mention) announce(spoken(m, view, names, label, m.channel !== reading));
      else counts.set(m.channel, (counts.get(m.channel) ?? 0) + 1);
    }
    const snap = store?.snapshot();
    for (const [channel, count] of unreadToAnnounce(counts, view.chatCounts, snap?.read ?? null, view.chatUnheard, snap?.local)) announce(t("announce.unreadIn", { count, channel: label(channel) }));
  }, [view]);
}

/** "Mira: hello", or "Mira in Botany: hello" when the channel is not the one on screen. */
function spoken(m: ChatLine, view: PlayerView, names: ReturnType<typeof useNames>, label: (c: ChannelId) => string, named: boolean): string {
  if (m.system) return isNeronMessage(m.system.key) ? `NERON: ${names.logLine(m.system)}` : names.logLine(m.system);
  const character = view.players.find((p) => p.id === m.from)?.character;
  const who = names.character(character ?? "");
  return `${who}${named ? ` (${label(m.channel)})` : ""}: ${m.text}`;
}
