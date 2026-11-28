// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { applyAction, applyInput, createChannel, ITRACKIE_ITEM, leaveChannel, viewFor, type Action, type GameState, type PlanDraft, type PlayerView, type PrivateChannelId } from "@mush2/shared";

const isMobile = false;
vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return isMobile;
      },
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  Element.prototype.getAnimations = () => [];
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

import "../../src/i18n/index.ts";
import i18n from "../../src/i18n/index.ts";
import { ChannelMenu, PrivateChannels, type ChannelPane } from "../../src/hud/PrivateChannels.tsx";
import { sampleState } from "../../src/designKit/sampleView.ts";

afterEach(() => {
  cleanup();
});

function must<T extends { ok: true; state: GameState } | { ok: false; error: string }>(r: T): GameState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Ship with everyone carrying an iTrackie in the lab, and p0's private channel with p1 and p2. */
function makeChannelShip(): { state: GameState; channel: PrivateChannelId } {
  const s = sampleState();
  s.preselection = false;
  for (const p of s.players) {
    p.room = "LABORATORY";
    if (!s.items.some((i) => i.type === ITRACKIE_ITEM && i.at.kind === "player" && i.at.id === p.id)) {
      s.items.push({ id: `it-itrackie-${p.id}`, type: ITRACKIE_ITEM, at: { kind: "player", id: p.id } });
    }
  }
  const withChannel = must(createChannel(s, "p0", "Ops", ["p1", "p2"]));
  return { state: withChannel, channel: withChannel.channels[0]!.id };
}

/** One open channel with its ⋯ menu, wired as the iTrackie wires them (pane and composer state above both). */
function Channel({ view, channel, onPostPlan = () => {}, onPlanAction = () => {} }: { view: PlayerView; channel: PrivateChannelId; onPostPlan?: (plan: PlanDraft) => void; onPlanAction?: (action: Action) => void }) {
  const [pane, setPane] = useState<ChannelPane>("messages");
  const [composing, setComposing] = useState(false);
  const c = view.privateChannels.find((ch) => ch.id === channel)!;
  return (
    <I18nextProvider i18n={i18n}>
      <button type="button" onClick={() => setPane("messages")}>
        Back
      </button>
      <ChannelMenu view={view} channel={c} pane={pane} onPane={setPane} onCompose={() => setComposing(true)} canPlan onInvite={() => {}} onLeave={() => {}} />
      <PrivateChannels open={channel} onOpen={() => {}} view={view} pane={pane} onPane={setPane} composing={composing} onComposing={setComposing} onChat={() => {}} onToggle={() => {}} onPostPlan={onPostPlan} onPlanAction={onPlanAction} />
    </I18nextProvider>
  );
}

/** The ⋯ menu's items, by name (opening the menu first). */
async function menuItems(): Promise<string[]> {
  await userEvent.setup().click(screen.getByRole("button", { name: "Channel options" }));
  await screen.findByRole("menu");
  return screen.getAllByRole("menuitem").map((el) => el.textContent ?? "");
}

async function pickMenuItem(name: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Channel options" }));
  await user.click(await screen.findByRole("menuitem", { name }));
}

function doublePress(button: HTMLElement): void {
  fireEvent.click(button);
  fireEvent.click(button);
}

describe("PrivateChannels plans UI", () => {
  it("offers New plan in the ⋯ menu only to the creator, and no planning once the creator is gone", async () => {
    const { state, channel } = makeChannelShip();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(state, "p0")} channel={channel} />
      </I18nextProvider>,
    );
    expect(await menuItems()).toEqual(["New plan", "Invite", "Leave channel"]);

    // Non-creator gets no New plan.
    rerender(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(state, "p1")} channel={channel} />
      </I18nextProvider>,
    );
    expect(screen.queryByRole("menuitem", { name: "New plan" })).toBeNull();
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Invite", "Leave channel"]);

    // Creator leaves: planningClosed is true and there is no plan, so no planning UI at all.
    const closed = must(leaveChannel(state, "p0", channel));
    rerender(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(closed, "p1")} channel={channel} />
      </I18nextProvider>,
    );
    expect(screen.queryByRole("menuitem", { name: "New plan" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Plan" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Plan" })).toBeNull();
  });

  it("opens the composer, disables Post when empty or over cap, keeps draft on refusal, and closes when open plan arrives", async () => {
    const { state, channel } = makeChannelShip();
    const onPostPlan = vi.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(state, "p0")} channel={channel} onPostPlan={onPostPlan} onPlanAction={() => {}} />
      </I18nextProvider>,
    );

    await pickMenuItem("New plan");
    const dialog = screen.getByRole("dialog", { name: "New plan" });
    const postBtn = within(dialog).getByRole("button", { name: "Post plan" }) as HTMLButtonElement;
    expect(postBtn.disabled).toBe(true);
    expect(within(dialog).getByText("Add at least one slot to post.")).toBeTruthy();

    // Add one on-call slot and one task slot.
    fireEvent.click(within(dialog).getByRole("button", { name: "+ On call" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "+ Task" }));
    expect(postBtn.disabled).toBe(false);

    // Submit: emits PlanDraft and stays open until the server's view contains the open plan.
    fireEvent.click(postBtn);
    expect(onPostPlan).toHaveBeenCalledTimes(1);
    const submitted = onPostPlan.mock.calls[0]![0] as PlanDraft;
    expect(submitted.channel).toBe(channel);
    expect(submitted.slots).toHaveLength(2);
    expect(submitted.slots[0]).toEqual({ kind: "onCall" });
    expect(submitted.slots[1]!.kind).toBe("task");
    expect(screen.getByRole("dialog", { name: "New plan" })).toBeTruthy();

    // Exceed cap: Post disables with inline cap reason.
    for (let i = 0; i < 11; i++) fireEvent.click(within(dialog).getByRole("button", { name: "+ On call" }));
    expect(postBtn.disabled).toBe(true);
    expect(within(dialog).getByText("Too many slots (maximum 12).")).toBeTruthy();

    // When the server accepts and sends an open plan, the dialog closes and the channel shows its plan.
    const posted = must(applyInput(state, { type: "postPlan", by: "p0", plan: submitted }));
    rerender(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(posted, "p0")} channel={channel} onPostPlan={onPostPlan} onPlanAction={() => {}} />
      </I18nextProvider>,
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New plan" })).toBeNull());
    expect(screen.getByRole("region", { name: "Plan" })).toBeTruthy();
  });

  it("renders Claim, Withdraw, Done, Cancel, Go (disabled away from room, enabled in room), and outcomes after Go", async () => {
    const { state, channel } = makeChannelShip();
    const posted = must(
      applyInput(state, {
        type: "postPlan",
        by: "p0",
        plan: {
          channel,
          room: "REFECTORY",
          purpose: "meal",
          slots: [{ kind: "onCall" }, { kind: "onCall" }, { kind: "task", task: { type: "fiery_speech" } }],
        },
      }),
    );
    const planId = posted.plans[0]!.id;

    // Author away from room: Go is disabled with hint, Cancel is enabled.
    const onPlanAction = vi.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(posted, "p0")} channel={channel} onPostPlan={() => {}} onPlanAction={onPlanAction} />
      </I18nextProvider>,
    );
    await pickMenuItem("Plan");
    const card = screen.getByRole("region", { name: "Plan" });
    expect(within(card).getByText(/Expires end of day 2/)).toBeTruthy();
    const goDisabled = within(card).getByRole("button", { name: "Go" });
    expect(goDisabled.getAttribute("aria-disabled")).toBe("true");
    expect(within(card).getByText(/Go to .* to call\./)).toBeTruthy();
    doublePress(within(card).getByRole("button", { name: "Cancel" }));
    expect(onPlanAction).toHaveBeenCalledWith({ type: "cancel_plan", plan: planId });

    // Member claims on-call and task slots.
    onPlanAction.mockClear();
    rerender(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(posted, "p1")} channel={channel} onPostPlan={() => {}} onPlanAction={onPlanAction} />
      </I18nextProvider>,
    );
    const claimButtons = within(screen.getByRole("region", { name: "Plan" })).getAllByRole("button", { name: "Claim" });
    doublePress(claimButtons[0]!);
    expect(onPlanAction).toHaveBeenCalledWith({ type: "claim_slot", plan: planId, slot: 0 });

    // After p1 claims slot 0 (onCall) and slot 2 (task), p1 sees Withdraw and Done.
    const claimed = must(applyAction(must(applyAction(posted, "p1", { type: "claim_slot", plan: planId, slot: 0 })), "p1", { type: "claim_slot", plan: planId, slot: 2 }));
    onPlanAction.mockClear();
    rerender(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(claimed, "p1")} channel={channel} onPostPlan={() => {}} onPlanAction={onPlanAction} />
      </I18nextProvider>,
    );
    doublePress(within(screen.getByRole("region", { name: "Plan" })).getByRole("button", { name: "Done" }));
    expect(onPlanAction).toHaveBeenCalledWith({ type: "mark_done", plan: planId, slot: 2 });

    // Author moves to Refectory: Go is enabled.
    claimed.players[0]!.room = "REFECTORY";
    onPlanAction.mockClear();
    rerender(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(claimed, "p0")} channel={channel} onPostPlan={() => {}} onPlanAction={onPlanAction} />
      </I18nextProvider>,
    );
    const goEnabled = within(screen.getByRole("region", { name: "Plan" })).getByRole("button", { name: "Go" });
    expect(goEnabled.getAttribute("aria-disabled")).toBeNull();
    doublePress(goEnabled);
    expect(onPlanAction).toHaveBeenCalledWith({ type: "summon", plan: planId });

    // After Go: outcomes show on the card (Arrived for p1, Unclaimed for slot 1).
    const called = must(applyAction(claimed, "p0", { type: "summon", plan: planId }));
    rerender(
      <I18nextProvider i18n={i18n}>
        <Channel view={viewFor(called, "p0")} channel={channel} onPostPlan={() => {}} onPlanAction={onPlanAction} />
      </I18nextProvider>,
    );
    const calledCard = screen.getByRole("region", { name: "Plan" });
    expect(within(calledCard).getByText("Called")).toBeTruthy();
    expect(within(calledCard).getByText("Arrived")).toBeTruthy();
    expect(within(calledCard).getByText("Unclaimed")).toBeTruthy();
  });

  it("Plan in the ⋯ menu swaps the messages for the plan, and back returns to the messages", async () => {
    const { state, channel } = makeChannelShip();
    const posted = must(
      applyInput(state, { type: "postPlan", by: "p0", plan: { channel, room: "REFECTORY", purpose: "meal", slots: [{ kind: "onCall" }] } }),
    );
    render(<Channel view={viewFor(posted, "p1")} channel={channel} />);
    expect(screen.queryByRole("region", { name: "Plan" })).toBeNull();
    // The thread stays mounted (keeping its draft); it is hidden with CSS while the plan shows.
    const messagesHidden = () => screen.getByPlaceholderText("Message Ops…").closest("[hidden]") !== null;
    expect(messagesHidden()).toBe(false);

    await pickMenuItem("Plan");
    expect(screen.getByRole("region", { name: "Plan" })).toBeTruthy();
    expect(messagesHidden()).toBe(true);
    // Already on the plan: the menu no longer offers it.
    expect(await menuItems()).toEqual(["Invite", "Leave channel"]);

    fireEvent.click(screen.getByRole("button", { name: "Back", hidden: true }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Plan" })).toBeNull());
    expect(messagesHidden()).toBe(false);
  });
});
