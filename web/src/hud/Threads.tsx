import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_THREAD_NAME_LENGTH, chatPageOf, type ChannelId, type PlayerView, type ThreadId } from "@mush2/shared";
import { IconButton } from "./IconButton.tsx";
import { MessageEntry, Thread, messageCounts, senderOf } from "./Thread.tsx";
import { Scroller } from "./Scroller.tsx";
import { TAB_ICONS } from "../art/assets.ts";
import { useChatPages } from "../chatPages.tsx";
import { UnreadChip } from "./UnreadChip.tsx";

/** A thread name suggested from a message: its first line, without markdown marks, cut to the limit. */
export function threadNameFrom(text: string): string {
  return (text.split("\n")[0] ?? "").replace(/[*_`#>~[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_THREAD_NAME_LENGTH);
}

/**
 * The Threads tab, like Discord threads under a channel: a list of global
 * chat's threads (newest first) with a form to start one, or one open thread
 * with its starter message on top. Every thread stays mounted, hidden with
 * CSS, so each keeps its own draft.
 */
export function Threads({
  view,
  active = true,
  open,
  onOpen,
  name,
  onName,
  starter,
  onCancelStarter,
  onCreate,
  onChat,
  onToggle,
}: {
  view: PlayerView;
  /** The Threads tab is on screen: the open thread places its "New messages" divider (#400). */
  active?: boolean;
  open: ThreadId | null;
  onOpen: (id: ThreadId | null) => void;
  name: string;
  onName: (name: string) => void;
  /** The global message the new thread will start from, if any. */
  starter: number | null;
  onCancelStarter: () => void;
  onCreate: (name: string, from?: number) => void;
  onChat: (channel: ChannelId, text: string) => void;
  onToggle: (channel: ChannelId, seq: number, line: number) => void;
}) {
  const { t } = useTranslation();
  const readable = view.readChannels.includes("global");
  const canStart = view.chatChannels.includes("global");
  const counts = messageCounts(view);
  // By `seq`: in the view, or on an older page fetched for it (#355). Global messages are never deleted, so a starter
  // not found here is one whose page hasn't arrived yet.
  const pages = useChatPages();
  const globalMessage = (seq: number | null | undefined) =>
    seq == null ? undefined : (view.chat.find((m) => m.channel === "global" && m.seq === seq) ?? pages?.get("global", chatPageOf(seq))?.find((m) => m.seq === seq));
  const starterMessage = globalMessage(starter);
  // The open thread's starter (and the one a new thread will start from) can sit two or more pages back: fetch its page.
  const openFrom = view.threads.find((th) => th.id === open)?.from;
  const missing = [openFrom, starter].filter((seq): seq is number => seq != null && !globalMessage(seq));
  const missingPages = [...new Set(missing.map(chatPageOf))].join(",");
  useEffect(() => {
    if (!readable || !missingPages) return;
    for (const page of missingPages.split(",")) pages?.request("global", Number(page));
  }, [missingPages, readable, pages]);
  const threads = [...view.threads].reverse();

  // Open the thread we just asked for once the server's view has it: the first
  // of ours that wasn't there when we sent the request.
  const [awaiting, setAwaiting] = useState<ReadonlySet<ThreadId> | null>(null);
  useEffect(() => {
    if (!awaiting) return;
    const made = view.threads.find((th) => th.createdBy === view.you.id && !awaiting.has(th.id));
    if (!made) return;
    setAwaiting(null);
    onOpen(made.id);
  }, [awaiting, view.threads, view.you.id, onOpen]);

  if (!readable) return <p className="sub">{t("itrackie.threads.needITrackie")}</p>;
  return (
    <>
      <div className="threads-list" hidden={open !== null}>
        <Scroller items={threads.length}>
          {threads.length === 0 ? (
            <p className="sub">{t("itrackie.threads.empty")}</p>
          ) : (
            <ul className="thread-rows" aria-label={t("itrackie.threads.list")}>
              {threads.map((th) => (
                <li key={th.id}>
                  <button type="button" className="thread-link" onClick={() => onOpen(th.id)}>
                    <img className="tab-icon" src={TAB_ICONS.threads} alt="" />
                    <span className="thread-name">{th.name}</span>
                    <span className="thread-count">{t("itrackie.threads.messages", { count: counts.get(th.id) ?? 0 })}</span>
                    <UnreadChip channel={th.id} total={view.chatCounts[th.id] ?? 0} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Scroller>
        {canStart && starterMessage && (
          <div className="thread-starter">
            <p className="sub">{t("itrackie.threads.startingFrom")}</p>
            <ol className="feed">
              <MessageEntry character={senderOf(view, starterMessage)} mine={starterMessage.from === view.you.id} message={starterMessage} />
            </ol>
          </div>
        )}
        {canStart && (
          <form
            className="chat-input thread-create"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setAwaiting(new Set(view.threads.map((th) => th.id)));
              onCreate(name, starterMessage?.seq);
            }}
          >
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              maxLength={MAX_THREAD_NAME_LENGTH}
              placeholder={t("itrackie.threads.namePlaceholder")}
              aria-label={t("itrackie.threads.nameLabel")}
            />
            {starterMessage && (
              <button type="button" onClick={onCancelStarter}>
                {t("itrackie.threads.cancel")}
              </button>
            )}
            <IconButton type="submit" src={TAB_ICONS.newChannel} label={t("itrackie.threads.create")} disabled={!name.trim()} />
          </form>
        )}
      </div>
      {view.threads.map((th) => {
        const from = globalMessage(th.from);
        return (
          <div key={th.id} className="feature" hidden={th.id !== open}>
            <Thread
              view={view}
              channel={th.id}
              placeholder={t("itrackie.threads.messagePlaceholder", { name: th.name })}
              onSend={(text) => onChat(th.id, text)}
              onToggle={onToggle}
              active={active && th.id === open}
              headKey={from ?? "loading"}
              head={
                th.from === undefined || !(from || pages) ? undefined : from ? (
                  <MessageEntry character={senderOf(view, from)} mine={from.from === view.you.id} message={from} className="thread-head" />
                ) : (
                  // Global messages are never deleted: a starter not here is on a page still on its way.
                  <li className="sub thread-head">{t("itrackie.pages.loading")}</li>
                )
              }
            />
          </div>
        );
      })}
    </>
  );
}
