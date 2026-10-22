import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import type { ChannelId, PlayerView, PrivateChannelId } from "@mush2/shared";
import { IconButton } from "./IconButton.tsx";
import { Thread } from "./Thread.tsx";
import { TAB_ICONS } from "../art/assets.ts";

export interface ChannelHandlers {
  onCreate: (name: string) => void;
  onInvite: (channel: PrivateChannelId, player: string) => void;
  onLeave: (channel: PrivateChannelId) => void;
}

/**
 * The Private tab, laid out like Features: a drop-down picks one of your
 * channels, its thread fills the panel, and members, invite, and leave sit
 * above it. Creating a channel is at the bottom.
 */
export function PrivateChannels({
  view,
  onChat,
  onToggle,
  onCreate,
  onInvite,
  onLeave,
}: { view: PlayerView; onChat: (channel: ChannelId, text: string) => void; onToggle: (message: number, line: number) => void } & ChannelHandlers) {
  const { t, i18n } = useTranslation();
  const [picked, setPicked] = useState<PrivateChannelId | "">("");
  const [name, setName] = useState("");
  const [invitee, setInvitee] = useState("");
  // Falls back to the first channel when none is picked or the picked one is gone (left, or deleted).
  const current = view.privateChannels.find((c) => c.id === picked) ?? view.privateChannels[0];
  const names = useNames();
  const nameOf = (id: string) => names.character((id === view.you.id ? view.you : view.players.find((p) => p.id === id))?.character ?? id);
  const atLimit = view.privateChannels.length >= view.channelLimit;
  const invitable = current ? view.players.filter((p) => p.alive && !current.members.includes(p.id)) : [];

  return (
    <>
      {current ? (
        <>
          <div className="channel-bar">
            <select
              className="feature-select"
              value={current.id}
              onChange={(e) => setPicked(e.target.value as PrivateChannelId)}
              aria-label={t("channels.list")}
            >
              {view.privateChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <IconButton icon="🚪" label={t("channels.leave")} onClick={() => onLeave(current.id)} />
          </div>
          <p className="sub channel-members">
            {t("channels.members", { names: new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(current.members.map(nameOf)) })}
          </p>
          {/* One block per channel, hidden with CSS, so each keeps its own draft. */}
          {view.privateChannels.map((c) => (
            <div key={c.id} className="feature" hidden={c.id !== current.id}>
              <Thread
                view={view}
                channel={c.id}
                placeholder={t("channels.messagePlaceholder", { name: c.name })}
                onSend={(text) => onChat(c.id, text)}
                onToggle={onToggle}
              />
            </div>
          ))}
          {invitable.length > 0 && (
            <form
              className="chat-input channel-invite"
              onSubmit={(e) => {
                e.preventDefault();
                if (!invitee) return;
                onInvite(current.id, invitee);
                setInvitee("");
              }}
            >
              <select value={invitee} onChange={(e) => setInvitee(e.target.value)} aria-label={t("channels.inviteLabel")}>
                <option value="">{t("channels.invitePick")}</option>
                {invitable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {names.character(p.character)}
                  </option>
                ))}
              </select>
              <IconButton type="submit" icon="📨" label={t("channels.invite")} disabled={!invitee} />
            </form>
          )}
        </>
      ) : (
        <p className="sub channel-empty">{t("channels.empty")}</p>
      )}
      <form
        className="chat-input channel-create"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || atLimit) return;
          onCreate(name);
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder={t("channels.namePlaceholder")}
          aria-label={t("channels.nameLabel")}
          disabled={atLimit}
        />
        <IconButton type="submit" src={TAB_ICONS.newChannel} label={t("channels.create")} disabled={atLimit || !name.trim()} />
      </form>
      <p className="sub">{t("channels.count", { used: view.privateChannels.length, limit: view.channelLimit })}</p>
    </>
  );
}
