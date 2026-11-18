import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@base-ui/react/dialog";
import { useNames } from "../i18n/names.ts";
import type { ChannelId, PlayerId, PlayerView, PrivateChannelId } from "@mush2/shared";
import { FramedDialog } from "./FramedDialog.tsx";
import { IconButton } from "./IconButton.tsx";
import { Thread } from "./Thread.tsx";
import { UnreadChip } from "./UnreadChip.tsx";
import { TAB_ICONS, standingSprite } from "../art/assets.ts";

export interface ChannelHandlers {
  onCreate: (name: string, members: PlayerId[]) => void;
  onInvite: (channel: PrivateChannelId, player: string) => void;
  onLeave: (channel: PrivateChannelId) => void;
}

/**
 * The Private tab: one row per channel slot. A slot in use picks that channel
 * (its thread fills the panel below) and has a leave button; a free slot opens
 * the create dialog (name and initial members). Without the handlers (a read-only view)
 * there is nothing to leave, invite or create.
 */
export function PrivateChannels({
  view,
  active = true,
  onChat,
  onToggle,
  onCreate,
  onInvite,
  onLeave,
}: {
  view: PlayerView;
  /** The Private tab is on screen: the picked channel places its "New messages" divider (#400). */
  active?: boolean;
  onChat: (channel: ChannelId, text: string) => void; onToggle: (channel: ChannelId, seq: number, line: number) => void } & Partial<ChannelHandlers>) {
  const { t, i18n } = useTranslation();
  const [picked, setPicked] = useState<PrivateChannelId | "">("");
  const [inviting, setInviting] = useState(false);
  const [creating, setCreating] = useState(false);
  // Channel ids that existed when you last created one, so the new one can be picked once the server's view has it.
  const pendingPick = useRef<Set<PrivateChannelId> | null>(null);
  // Falls back to the first channel when none is picked or the picked one is gone (left, or deleted).
  const current = view.privateChannels.find((c) => c.id === picked) ?? view.privateChannels[0];
  const names = useNames();
  const label = (c: { name: string; day: number; cycleOfDay: number }) => c.name || t("channels.defaultName", { day: c.day, cycle: c.cycleOfDay });
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
                {label(c)}
                <UnreadChip channel={c.id} total={view.chatCounts[c.id] ?? 0} unheard={view.chatUnheard?.[c.id]} />
              </button>
              {onLeave && <IconButton icon="🚪" label={t("channels.leaveNamed", { name: label(c) })} onClick={() => onLeave(c.id)} />}
            </li>
          ) : (
            <li key={`free-${i}`} className="channel-slot">
              <button type="button" className="channel-slot-new" disabled={!onCreate} onClick={() => setCreating(true)}>
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
                placeholder={t("channels.messagePlaceholder", { name: label(c) })}
                onSend={(text) => onChat(c.id, text)}
                onToggle={onToggle}
                active={active && c.id === current.id}
              />
            </div>
          ))}
          {onInvite && invitable.length > 0 && (
            <button type="button" className="channel-invite" onClick={() => setInviting(true)}>
              <span aria-hidden="true">📨</span> {t("channels.invite")}
            </button>
          )}
        </>
      ) : (
        <p className="sub channel-empty">{t("channels.empty")}</p>
      )}
      <ChannelDialog
        mode="invite"
        view={view}
        open={inviting && !!current}
        candidates={invitable.map((p) => p.id)}
        onOpenChange={setInviting}
        onSubmit={(_, members) => {
          if (current) for (const m of members) onInvite?.(current.id, m);
          setInviting(false);
        }}
      />
      <ChannelDialog
        mode="create"
        view={view}
        open={creating}
        candidates={view.players.filter((p) => p.alive).map((p) => p.id)}
        onOpenChange={setCreating}
        onSubmit={(name, members) => {
          pendingPick.current = new Set(view.privateChannels.map((c) => c.id));
          onCreate?.(name, members);
          setCreating(false);
        }}
      />
    </>
  );
}

/**
 * One dialog for both flows: "create" asks for a name and picks who starts in the channel (anyone without a free
 * slot is skipped by the server, as a refused invite would be); "invite" only picks who to add to the open one.
 */
function ChannelDialog({
  mode,
  view,
  open,
  candidates,
  onOpenChange,
  onSubmit,
}: {
  mode: "create" | "invite";
  view: PlayerView;
  open: boolean;
  candidates: PlayerId[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, members: PlayerId[]) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<PlayerId[]>([]);
  const creating = mode === "create";
  const choices = view.players.filter((p) => candidates.includes(p.id));
  const reset = () => {
    setName("");
    setMembers([]);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <FramedDialog heading={t(creating ? "channels.createTitle" : "channels.inviteTitle")} closeLabel={t("channels.close")}>
        <form
          className="channel-create-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!creating && members.length === 0) return;
            // Drop anyone who died (or joined) while the dialog was open.
            onSubmit(name, members.filter((m) => choices.some((p) => p.id === m)));
            reset();
          }}
        >
          {creating && (
            <label className="field channel-create-name">
              <span className="field-label">{t("channels.nameLabel")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder={t("channels.namePlaceholder")} />
            </label>
          )}
          <fieldset className="field">
            <legend className="field-label">{t(creating ? "channels.membersLabel" : "channels.inviteLabel")}</legend>
            {choices.length === 0 && <p className="sub">{t("channels.noOne")}</p>}
            <div className="channel-picker">
              {choices.map((p) => {
                const on = members.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="pick-tile channel-pick"
                    aria-pressed={on}
                    onClick={() => setMembers((ms) => (on ? ms.filter((m) => m !== p.id) : [...ms, p.id]))}
                  >
                    <span style={standingSprite(p.character, 1)} aria-hidden="true" />
                    <span>{names.characterGiven(p.character)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <button type="submit" disabled={!creating && members.length === 0}>
            {t(creating ? "channels.create" : "channels.invite")}
          </button>
        </form>
      </FramedDialog>
    </Dialog.Root>
  );
}
