import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Dialog } from "@base-ui/react/dialog";
import { useNames } from "../i18n/names.ts";
import type { Action, ChannelId, Plan, PlanDraft, PlayerId, PlayerView, PrivateChannel, PrivateChannelId } from "@mush2/shared";
import { FramedDialog } from "./FramedDialog.tsx";
import { PlanCard } from "./PlanCard.tsx";
import { PlanComposer } from "./PlanComposer.tsx";
import { Scroller } from "./Scroller.tsx";
import { Thread } from "./Thread.tsx";
import { UnreadChip } from "./UnreadChip.tsx";
import { TAB_ICONS, bustIcon, skillIcon, standingSprite } from "../art/assets.ts";
import { Popover } from "@base-ui/react/popover";
import { Menu } from "@base-ui/react/menu";

export interface ChannelHandlers {
  onCreate: (name: string, members: PlayerId[]) => void;
  onInvite: (channel: PrivateChannelId, player: string) => void;
  onLeave: (channel: PrivateChannelId) => void;
  onPostPlan?: (plan: PlanDraft) => void;
  onPlanAction?: (action: Action) => void;
}

/** A channel's name, or the day and cycle it was opened when it has none. */
export function channelLabel(t: TFunction, c: { name: string; day: number; cycleOfDay: number }): string {
  return c.name || t("channels.defaultName", { day: c.day, cycle: c.cycleOfDay });
}

/**
 * The Private tab, like the Threads tab: a list of your channels (one row per slot in use, then a "New channel" row
 * per free slot, then any tapped through Radio Piracy), or one open channel with its members and thread. The open
 * channel's name, the way back, and its ⋯ menu (`ChannelMenu`) sit in the iTrackie's title row; the menu's Plan swaps
 * the messages for the channel's plan, and the way back returns from the plan to the messages first. Every channel
 * stays mounted, hidden with CSS, so each keeps its own draft. Without the handlers (a read-only view) there is
 * nothing to leave, invite or create.
 */
/** A channel as the view lists it: one read through a Radio Piracy hack is marked `tapped`. */
type ViewChannel = PlayerView["privateChannels"][number];

/** What an open channel shows: its messages, or its plan (opened from the channel's ⋯ menu). */
export type ChannelPane = "messages" | "plan";

/** The channel's plan to show: its open one, else its latest. */
export function planFor(view: PlayerView, channelId: PrivateChannelId): Plan | undefined {
  const list = view.plans.filter((p) => p.channel === channelId);
  return list.find((p) => p.status === "open") ?? list.at(-1);
}

/** You can post a new plan here: you opened the channel, planning isn't closed, and none is open. */
function canPostPlan(view: PlayerView, c: PrivateChannel, plan: Plan | undefined): boolean {
  return (
    view.you.id === c.createdBy &&
    !c.planningClosed &&
    plan?.status !== "open" &&
    view.chatChannels.includes(c.id) &&
    view.phase === "playing" &&
    !view.preselection
  );
}

export function PrivateChannels({
  view,
  active = true,
  open,
  onOpen,
  pane,
  onPane,
  composing,
  onComposing,
  onChat,
  onToggle,
  onCreate,
  onPostPlan,
  onPlanAction,
}: {
  view: PlayerView;
  /** The Private tab is on screen: the open channel places its "New messages" divider (#400). */
  active?: boolean;
  /** The open channel, or null for the list. */
  open: PrivateChannelId | null;
  onOpen: (id: PrivateChannelId | null) => void;
  /** The open channel's pane; the plan shows only while the channel has one. */
  pane: ChannelPane;
  onPane: (pane: ChannelPane) => void;
  /** The plan composer is open (from the ⋯ menu, or the plan card's New plan). */
  composing: boolean;
  onComposing: (open: boolean) => void;
  onChat: (channel: ChannelId, text: string, as?: string) => void;
  onToggle: (channel: ChannelId, seq: number, line: number) => void;
} & Partial<ChannelHandlers>) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  // Channel ids that existed when you last created one, so the new one can be opened once the server's view has it.
  const pendingPick = useRef<Set<PrivateChannelId> | null>(null);
  // A channel left (or deleted) while open is gone from the view: back to the list.
  const current = view.privateChannels.find((c) => c.id === open);
  // Channels read through a Radio Piracy hack (`tapped`) take no slot and can't be left or invited to.
  const mine = view.privateChannels.filter((c) => !c.tapped);
  const tapped = view.privateChannels.filter((c) => c.tapped);
  // Opening a channel needs global chat's access: an iTrackie, or Luyten-Ceti's brain probes (createChannel).
  const canCreate = view.chatChannels.includes("global");
  // A modifier can lower the limit below the channels you're already in; those still get a row.
  const free = Math.max(0, view.channelLimit - mine.length);

  useEffect(() => {
    const before = pendingPick.current;
    if (!before) return;
    const made = view.privateChannels.find((c) => c.createdBy === view.you.id && !before.has(c.id));
    if (made) {
      onOpen(made.id);
      pendingPick.current = null;
    }
  }, [view.privateChannels, view.you.id, onOpen]);

  const row = (c: ViewChannel) => (
    <li key={c.id}>
      <button type="button" className="list-row thread-row" onClick={() => onOpen(c.id)}>
        <img className="tab-icon" src={c.tapped ? skillIcon("radio_piracy") : TAB_ICONS.private} alt={c.tapped ? t("actions.radioPiracy") : ""} />
        <span className="thread-name">{channelLabel(t, c)}</span>
        <span className="thread-count sub">{t("channels.memberCount", { count: c.members.length })}</span>
        <UnreadChip channel={c.id} total={view.chatCounts[c.id] ?? 0} unheard={view.chatUnheard?.[c.id]} />
      </button>
    </li>
  );

  return (
    <>
      <div className="threads-list" hidden={!!current}>
        <Scroller items={view.privateChannels.length} top>
          {view.privateChannels.length === 0 && <p className="sub channel-empty">{t("channels.empty")}</p>}
          {(view.privateChannels.length > 0 || free > 0) && (
            <ul className="thread-rows" aria-label={t("channels.list")}>
              {mine.map(row)}
              {Array.from({ length: free }, (_, i) => (
                <li key={`free-${i}`}>
                  <button type="button" className="list-row thread-row" disabled={!onCreate || !canCreate} onClick={() => setCreating(true)}>
                    <img className="tab-icon" src={TAB_ICONS.newChannel} alt="" />
                    <span className="thread-name">{canCreate ? t("channels.newSlot") : t("channels.newSlotNeedsITrackie")}</span>
                  </button>
                </li>
              ))}
              {tapped.map(row)}
            </ul>
          )}
        </Scroller>
      </div>
      {/* One block per channel, hidden with CSS, so each keeps its own draft. */}
      {view.privateChannels.map((c) => {
        const plan = planFor(view, c.id);
        const canPost = !!onPostPlan && canPostPlan(view, c, plan);
        const planShown = pane === "plan" && !!plan;
        return (
          <div key={c.id} className="feature" hidden={c.id !== current?.id}>
            <ChannelMembers view={view} members={c.members} />
            <div className="plan-pane" hidden={!planShown}>
              {plan && <PlanCard view={view} plan={plan} onAction={onPlanAction} onNewPlan={canPost ? () => onComposing(true) : undefined} />}
            </div>
            <div className="plan-messages-pane" hidden={planShown}>
              <Thread
                view={view}
                channel={c.id}
                placeholder={t("channels.messagePlaceholder", { name: channelLabel(t, c) })}
                onSend={(text, as) => onChat(c.id, text, as)}
                onToggle={onToggle}
                active={active && c.id === current?.id && !planShown}
              />
            </div>
          </div>
        );
      })}
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
      {current && onPostPlan && (
        <PlanComposer
          view={view}
          channel={current}
          open={composing}
          onOpenChange={onComposing}
          onPost={(draft) => {
            onPostPlan(draft);
            onPane("plan");
          }}
        />
      )}
    </>
  );
}

/**
 * An open channel's members as a row of character busts, each named in a popover opened on hover or a tap (as the
 * status icons are) and to screen readers by its label.
 */
function ChannelMembers({ view, members }: { view: PlayerView; members: PlayerId[] }) {
  const { t } = useTranslation();
  const names = useNames();
  const characterOf = (id: PlayerId) => (id === view.you.id ? view.you : view.players.find((p) => p.id === id))?.character;
  return (
    <ul className="channel-members" aria-label={t("channels.membersList")}>
      {members.map((id) => {
        const character = characterOf(id);
        const name = character ? names.character(character) : id;
        return (
          <li key={id}>
            <Popover.Root>
              <Popover.Trigger openOnHover delay={200} className="channel-member" aria-label={name}>
                <img src={bustIcon(character)} alt="" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner sideOffset={6}>
                  <Popover.Popup className="tooltip">{name}</Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The open channel's ⋯ menu, at the right of the iTrackie's title row; only the way back stays outside it. Plan (or
 * New plan, for the channel's creator while it has none to show), Invite, Mark all read and Leave. A tapped channel
 * (Radio Piracy) has no Invite or Leave; Invite shows only while someone alive is left to invite. Renders nothing
 * when the menu would be empty.
 */
export function ChannelMenu({
  view,
  channel,
  pane,
  onPane,
  onCompose,
  onInvite,
  onLeave,
  canPlan,
  onMarkRead,
}: {
  view: PlayerView;
  channel: ViewChannel;
  pane: ChannelPane;
  onPane: (pane: ChannelPane) => void;
  onCompose: () => void;
  /** Plans can be posted from here (not a read-only view). */
  canPlan: boolean;
  /** Absent while there is nothing unread on the tab. */
  onMarkRead?: (() => void) | undefined;
} & Partial<Pick<ChannelHandlers, "onInvite" | "onLeave">>) {
  const { t } = useTranslation();
  const [inviting, setInviting] = useState(false);
  const plan = planFor(view, channel.id);
  const showPlan = !!plan && pane !== "plan";
  const newPlan = !plan && canPlan && !channel.tapped && canPostPlan(view, channel, plan);
  const invitable = channel.tapped ? [] : view.players.filter((p) => p.alive && !channel.members.includes(p.id));
  const invite = !!onInvite && invitable.length > 0;
  const leave = !!onLeave && !channel.tapped;
  if (!showPlan && !newPlan && !invite && !onMarkRead && !leave) return null;
  const item = (label: string, onClick: () => void, icon?: string) => (
    <Menu.Item nativeButton render={<button type="button" />} onClick={onClick}>
      {icon && <img className="menu-item-icon" src={icon} alt="" />}
      {label}
    </Menu.Item>
  );
  return (
    <>
      <Menu.Root>
        <Menu.Trigger className="channel-menu-button" aria-label={t("channels.menu")}>
          ⋯
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} align="end" className="message-menu-positioner">
            <Menu.Popup className="menu-popup">
              {showPlan && item(t("plans.planTab"), () => onPane("plan"))}
              {newPlan && item(t("plans.newPlan"), onCompose)}
              {invite && item(t("channels.invite"), () => setInviting(true), TAB_ICONS.invite)}
              {onMarkRead && item(t("itrackie.markRead"), onMarkRead)}
              {leave && item(t("channels.leave"), () => onLeave?.(channel.id))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <ChannelDialog
        mode="invite"
        view={view}
        open={inviting}
        candidates={invitable.map((p) => p.id)}
        onOpenChange={setInviting}
        onSubmit={(_, members) => {
          for (const m of members) onInvite?.(channel.id, m);
          setInviting(false);
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
          <fieldset className="field channel-picker-field">
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
                    <span className="channel-pick-name">{names.characterGiven(p.character)}</span>
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
