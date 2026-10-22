import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_THREAD_NAME_LENGTH, type ChannelId, type PlayerView, type ThreadId } from "@mush2/shared";
import { IconButton } from "./IconButton.tsx";
import { MessageEntry, Thread, messageCounts } from "./Thread.tsx";
import { Scroller } from "./Scroller.tsx";
import { TAB_ICONS } from "../art/assets.ts";

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
  open: ThreadId | null;
  onOpen: (id: ThreadId | null) => void;
  name: string;
  onName: (name: string) => void;
  /** The global message the new thread will start from, if any. */
  starter: number | null;
  onCancelStarter: () => void;
  onCreate: (name: string, from?: number) => void;
  onChat: (channel: ChannelId, text: string) => void;
  onToggle: (message: number, line: number) => void;
}) {
  const { t } = useTranslation();
  const readable = view.readChannels.includes("global");
  const canStart = view.chatChannels.includes("global");
  const counts = messageCounts(view);
  const globalMessage = (id: number | null | undefined) => (id == null ? undefined : view.chat.find((m) => m.channel === "global" && m.id === id));
  const starterMessage = globalMessage(starter);
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
              <MessageEntry view={view} message={starterMessage} />
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
              onCreate(name, starterMessage?.id);
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
      {open !== null && (
        <div className="channel-bar">
          <button type="button" className="thread-back" onClick={() => onOpen(null)}>
            ← {t("itrackie.threads.back")}
          </button>
        </div>
      )}
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
              head={
                th.from === undefined ? undefined : from ? (
                  <MessageEntry view={view} message={from} className="thread-head" />
                ) : (
                  <li className="sub thread-head">{t("itrackie.threads.starterGone")}</li>
                )
              }
            />
          </div>
        );
      })}
    </>
  );
}
