// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { applyAction, applyInput, createChannel, ITRACKIE_ITEM, leaveChannel, viewFor, type GameState, type PlanDraft, type PrivateChannelId } from "@mush2/shared";

let isMobile = false;
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
import { PrivateChannels } from "../../src/hud/PrivateChannels.tsx";
import { sampleState } from "../../src/designKit/sampleView.ts";

afterEach(() => {
  isMobile = false;
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

function doublePress(button: HTMLElement): void {
  fireEvent.click(button);
  fireEvent.click(button);
}

describe("PrivateChannels plans UI", () => {
  it("shows New plan only to the creator, and hides planning when the creator is gone", () => {
    const { state, channel } = makeChannelShip();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <PrivateChannels view={viewFor(state, "p0")} onChat={() => {}} onToggle={() => {}} onPostPlan={() => {}} onPlanAction={() => {}} />
      </I18nextProvider>,
    );
    expect(screen.getByRole("button", { name: "New plan" })).toBeTruthy();

    // Non-creator sees no New plan button.
    rerender(
      <I18nextProvider i18n={i18n}>
        <PrivateChannels view={viewFor(state, "p1")} onChat={() => {}} onToggle={() => {}} onPostPlan={() => {}} onPlanAction={() => {}} />
      </I18nextProvider>,
    );
    expect(screen.queryByRole("button", { name: "New plan" })).toBeNull();

    // Creator leaves: planningClosed is true and there is no plan, so no planning UI at all.
    const closed = must(leaveChannel(state, "p0", channel));
    rerender(
      <I18nextProvider i18n={i18n}>
        <PrivateChannels view={viewFor(closed, "p1")} onChat={() => {}} onToggle={() => {}} onPostPlan={() => {}} onPlanAction={() => {}} />
      </I18nextProvider>,
    );
    expect(screen.queryByRole("button", { name: "New plan" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Plan" })).toBeNull();
  });

  it("opens the composer, disables Post when empty or over cap, keeps draft on refusal, and closes when open plan arrives", async () => {
    const { state, channel } = makeChannelShip();
    const onPostPlan = vi.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <PrivateChannels view={viewFor(state, "p0")} onChat={() => {}} onToggle={() => {}} onPostPlan={onPostPlan} onPlanAction={() => {}} />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "New plan" }));
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

    // When the server accepts and sends an open plan, the dialog closes.
    const posted = must(applyInput(state, { type: "postPlan", by: "p0", plan: submitted }));
    rerender(
      <I18nextProvider i18n={i18n}>
        <PrivateChannels view={viewFor(posted, "p0")} onChat={() => {}} onToggle={() => {}} onPostPlan={onPostPlan} onPlanAction={() => {}} />
      </I18nextProvider>,
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New plan" })).toBeNull());
    expect(screen.getByRole("region", { name: "Plan" })).toBeTruthy();
  });

  it("renders Claim, Withdraw, Done, Cancel, Go (disabled away from room, enabled in room), and outcomes after Go", () => {
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
        <PrivateChannels view={viewFor(posted, "p0")} onChat={() => {}} onToggle={() => {}} onPostPlan={() => {}} onPlanAction={onPlanAction} />
      </I18nextProvider>,
    );
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
        <PrivateChannels view={viewFor(posted, "p1")} onChat={() => {}} onToggle={() => {}} onPostPlan={() => {}} onPlanAction={onPlanAction} />
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
        <PrivateChannels view={viewFor(claimed, "p1")} onChat={() => {}} onToggle={() => {}} onPostPlan={() => {}} onPlanAction={onPlanAction} />
      </I18nextProvider>,
    );
    doublePress(within(screen.getByRole("region", { name: "Plan" })).getByRole("button", { name: "Done" }));
    expect(onPlanAction).toHaveBeenCalledWith({ type: "mark_done", plan: planId, slot: 2 });

    // Author moves to Refectory: Go is enabled.
    claimed.players[0]!.room = "REFECTORY";
    onPlanAction.mockClear();
    rerender(
      <I18nextProvider i18n={i18n}>
        <PrivateChannels view={viewFor(claimed, "p0")} onChat={() => {}} onToggle={() => {}} onPostPlan={() => {}} onPlanAction={onPlanAction} />
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
        <PrivateChannels view={viewFor(called, "p0")} onChat={() => {}} onToggle={() => {}} onPostPlan={() => {}} onPlanAction={onPlanAction} />
      </I18nextProvider>,
    );
    const calledCard = screen.getByRole("region", { name: "Plan" });
    expect(within(calledCard).getByText("Called")).toBeTruthy();
    expect(within(calledCard).getByText("Arrived")).toBeTruthy();
    expect(within(calledCard).getByText("Unclaimed")).toBeTruthy();
  });

  it("shows a Messages | Plan switch on phones when planning is available", () => {
    isMobile = true;
    const { state } = makeChannelShip();
    render(
      <I18nextProvider i18n={i18n}>
        <PrivateChannels view={viewFor(state, "p0")} onChat={() => {}} onToggle={() => {}} onPostPlan={() => {}} onPlanAction={() => {}} />
      </I18nextProvider>,
    );
    const switchBar = screen.getByRole("tablist", { name: "Channel view" });
    const messagesTab = within(switchBar).getByRole("tab", { name: "Messages" });
    const planTab = within(switchBar).getByRole("tab", { name: "Plan" });
    expect(messagesTab.getAttribute("aria-selected")).toBe("true");
    expect(planTab.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(planTab);
    expect(planTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "New plan" })).toBeTruthy();
  });
});
