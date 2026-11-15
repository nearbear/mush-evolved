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

  it("teleports to a room immediately when clicked on the minimap", () => {
    const onKube = open();
    fireEvent.click(screen.getByRole("tab", { name: "Travel" }));
    expect(screen.getByText("Click a room to teleport there")).toBeTruthy();
    const lab = screen.getByRole("button", { name: "Laboratory" });
    fireEvent.focus(lab);
    expect(screen.getByText("Laboratory", { selector: "strong" })).toBeTruthy();
    fireEvent.click(lab);
    expect(onKube).toHaveBeenCalledWith("teleport", "LABORATORY");
  });

  it("teleports on Enter when a room on the minimap is focused", () => {
    const onKube = open();
    fireEvent.click(screen.getByRole("tab", { name: "Travel" }));
    const refectory = screen.getByRole("button", { name: "Refectory" });
    fireEvent.keyDown(refectory, { key: "Enter" });
    expect(onKube).toHaveBeenCalledWith("teleport", "REFECTORY");
  });

  it("spawns the item picked from the searched grid", () => {
    const onKube = open();
    fireEvent.click(screen.getByRole("tab", { name: "Items" }));
    const spawn = screen.getByRole("button", { name: "Spawn an item" }) as HTMLButtonElement;
    expect(spawn.disabled).toBe(true);
    const tiles = () => screen.getAllByRole("button", { pressed: false });
    const all = tiles().length;
    fireEvent.change(screen.getByLabelText("Search items"), { target: { value: "blaster" } });
    expect(tiles().length).toBeLessThan(all);
    fireEvent.click(screen.getByRole("button", { name: "Blaster" }));
    fireEvent.click(screen.getByRole("button", { name: "Spawn Blaster" }));
    expect(onKube).toHaveBeenCalledWith("spawn", "blaster");
  });

  it("says so when no item matches", () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "Items" }));
    fireEvent.change(screen.getByLabelText("Search items"), { target: { value: "zzzz" } });
    expect(screen.getByText("No item matches.")).toBeTruthy();
  });

  it("sends returnToSol and returnToEden from the Destinations tab", () => {
    const onKube = open();
    fireEvent.click(screen.getByRole("tab", { name: "Destinations" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to Sol" }));
    expect(onKube).toHaveBeenCalledWith("returnToSol");
    fireEvent.click(screen.getByRole("button", { name: "Return to Eden" }));
    expect(onKube).toHaveBeenCalledWith("returnToEden");
  });
});
