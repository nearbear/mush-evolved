// @vitest-environment jsdom
//
// The Superkube's window (#170): each row sends its `kube` option with the argument picked, and the lists come from
// kubeChoices. Real rules view, real English translations.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { viewFor } from "@mush2/shared";

// The frame's gold outline (TabOutline) watches its size, and Base UI's dialog reads animations: jsdom has neither.
vi.hoisted(() => {
  Element.prototype.getAnimations = () => [];
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
import "../../src/i18n/index.ts";
import { SuperkubeOpener } from "../../src/hud/Superkube.tsx";
import { SAMPLE_SEAT, sampleState } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

function open() {
  const onKube = vi.fn();
  render(<SuperkubeOpener view={viewFor(sampleState(), SAMPLE_SEAT)} onKube={onKube} />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  return onKube;
}

/** The Apply button in the row whose control is labelled `label`. */
const applyFor = (label: string) => screen.getByLabelText(label).closest(".kube-row")!.querySelector("button")!;

describe("SuperkubeOpener", () => {
  it("sends an option with no argument from its own button", () => {
    const onKube = open();
    fireEvent.click(screen.getByRole("button", { name: "Make yourself dirty" }));
    expect(onKube).toHaveBeenCalledWith("dirty");
  });

  it("sends a stat option with the number typed, starting from your current value", () => {
    const view = viewFor(sampleState(), SAMPLE_SEAT);
    const onKube = open();
    const hp = screen.getByLabelText("Set HP") as HTMLInputElement;
    expect(hp.value).toBe(String(view.you.hp));
    fireEvent.change(hp, { target: { value: "3" } });
    fireEvent.click(applyFor("Set HP"));
    expect(onKube).toHaveBeenCalledWith("hp", 3);
  });

  it("won't send a number that isn't a whole number", () => {
    const onKube = open();
    fireEvent.change(screen.getByLabelText("Set AP"), { target: { value: "" } });
    expect(applyFor("Set AP").disabled).toBe(true);
    expect(onKube).not.toHaveBeenCalled();
  });

  it("teleports to the Laboratory by default, the first room listed", () => {
    const onKube = open();
    fireEvent.click(screen.getByRole("tab", { name: "Travel" }));
    fireEvent.click(applyFor("Teleport to a room"));
    expect(onKube).toHaveBeenCalledWith("teleport", "LABORATORY");
  });
});
