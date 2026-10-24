import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@base-ui/react/dialog";
import { useNames } from "../i18n/names.ts";
import type { ChannelId, PlayerId, PlayerView, PrivateChannelId } from "@mush2/shared";
import { DialogHeader } from "./DialogHeader.tsx";
import { IconButton } from "./IconButton.tsx";
import { Thread } from "./Thread.tsx";
import { TAB_ICONS } from "../art/assets.ts";
import "./settings.css";

export interface ChannelHandlers {
  onCreate: (name: string, members: PlayerId[]) => void;
  onInvite: (channel: PrivateChannelId, player: string) => void;
  onLeave: (channel: PrivateChannelId) => void;
}

/**
 * The Private tab: one row per channel slot. A slot in use picks that channel
 * (its thread fills the panel below) and has a leave button; a free slot opens
 * the create dialog (name and initial members).
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
  const [invitee, setInvitee] = useState("");
  const [creating, setCreating] = useState(false);
  // Channel ids that existed when you last created one, so the new one can be picked once the server's view has it.
  const pendingPick = useRef<Set<PrivateChannelId> | null>(null);
  // Falls back to the first channel when none is picked or the picked one is gone (left, or deleted).
  const current = view.privateChannels.find((c) => c.id === picked) ?? view.privateChannels[0];
  const names = useNames();
  const nameOf = (id: string) => names.character((id === view.you.id ? view.you : view.players.find((p) => p.id === id))?.character ?? id);
  const invitable = current ? view.players.filter((p) => p.alive && !current.members.includes(p.id)) : [];
  // A modifier can lower the limit below the channels you're already in; those still get a row.
  const slots = Math.max(view.channelLimit, view.privateChannels.length);

  useEffect(() => {
    const before = pendingPick.current;
    if (!before) return;
    const made = view.privateChannels.find((c) => c.createdBy === view.you.id && !before.has(c.id));
    if (made) {
      setPicked(made.id);
      pendingPick.current = null;
    }
  }, [view.privateChannels, view.you.id]);

  return (
    <>
      <ul className="channel-slots" aria-label={t("channels.list")}>
        {Array.from({ length: slots }, (_, i) => {
          const c = view.privateChannels[i];
          return c ? (
            <li key={c.id} className="channel-slot">
              <button type="button" className="channel-slot-pick" aria-pressed={c.id === current?.id} onClick={() => setPicked(c.id)}>
                {c.name}
              </button>
              <IconButton icon="🚪" label={t("channels.leaveNamed", { name: c.name })} onClick={() => onLeave(c.id)} />
            </li>
          ) : (
            <li key={`free-${i}`} className="channel-slot">
              <button type="button" className="channel-slot-new" onClick={() => setCreating(true)}>
                <img className="tab-icon" src={TAB_ICONS.newChannel} alt="" />
                {t("channels.newSlot")}
              </button>
            </li>
          );
        })}
      </ul>
      {current ? (
        <>
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
      <CreateChannelDialog
        view={view}
        open={creating}
        onOpenChange={setCreating}
        onCreate={(name, members) => {
          pendingPick.current = new Set(view.privateChannels.map((c) => c.id));
          onCreate(name, members);
          setCreating(false);
        }}
      />
    </>
  );
}

/** Name the channel and tick who starts in it. Anyone without a free slot is skipped by the server, as a refused invite would be. */
function CreateChannelDialog({
  view,
  open,
  onOpenChange,
  onCreate,
}: {
  view: PlayerView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, members: PlayerId[]) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<PlayerId[]>([]);
  const living = view.players.filter((p) => p.alive);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setName("");
          setMembers([]);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup">
          <DialogHeader heading={t("channels.createTitle")} closeLabel={t("channels.close")} />
          <form
            className="channel-create-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              // Drop anyone who died while the dialog was open.
              onCreate(name, members.filter((m) => living.some((p) => p.id === m)));
              setName("");
              setMembers([]);
            }}
          >
            <label className="channel-create-name">
              <span>{t("channels.nameLabel")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder={t("channels.namePlaceholder")} />
            </label>
            <fieldset className="channel-create-members">
              <legend>{t("channels.membersLabel")}</legend>
              {living.length === 0 && <p className="sub">{t("channels.noOne")}</p>}
              {living.map((p) => (
                <label key={p.id} className="settings-cheat">
                  <input
                    type="checkbox"
                    checked={members.includes(p.id)}
                    onChange={(e) => setMembers((ms) => (e.target.checked ? [...ms, p.id] : ms.filter((m) => m !== p.id)))}
                  />
                  {names.character(p.character)}
                </label>
              ))}
            </fieldset>
            <button type="submit" disabled={!name.trim()}>
              {t("channels.create")}
            </button>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
