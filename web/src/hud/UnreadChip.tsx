// Unread in one channel, at the end of the row that opens it (#400): a thread, a private channel, a shared planet or
// report, a feature. The tab badge sums a whole tab; this says which channel in it.

import { useTranslation } from "react-i18next";
import { unreadCount, type ChannelId, type SeqRange } from "@mush2/shared";
import { useLocalReads, useReadCount } from "../chatRead.ts";

/** The chip for `count` unread, or nothing at 0. The number goes into the row's accessible name through hidden text. */
export function UnreadCount({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <>
      <span className="unread-chip" aria-hidden="true">
        {count > 99 ? "99+" : count}
      </span>
      {/* The space, outside the span (a name trims each element's own), keeps it a separate word in the row's name. */}{" "}
      <span className="sr-only">{t("itrackie.unread.chip", { count })}</span>
    </>
  );
}

/**
 * `channel`'s unread, redrawing only when its read state or `total` (its message count) changes. None with no store.
 * `unheard` (`PlayerView.chatUnheard[channel]`) never counts: messages a deaf player couldn't hear.
 */
export function UnreadChip({ channel, total, unheard }: { channel: ChannelId; total: number; unheard?: readonly SeqRange[] }) {
  return <UnreadCount count={useUnreadIn(channel, total, unheard)} />;
}

/** `channel`'s unread: `total` less the count read, the messages read one at a time and the unheard. 0 with no store. */
export function useUnreadIn(channel: ChannelId, total: number, unheard: readonly SeqRange[] | undefined): number {
  const read = useReadCount(channel, total);
  const local = useLocalReads(channel);
  return unreadCount({ [channel]: total }, { [channel]: read }, channel, { [channel]: unheard ?? [] }, { [channel]: local });
}
