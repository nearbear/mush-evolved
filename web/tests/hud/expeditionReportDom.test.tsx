// @vitest-environment jsdom
// The report as compact rows (docs/plans/archive/expedition-ui.md, "The report"), in the terminal frame.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";

vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
  Element.prototype.getAnimations = () => [];
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

import i18n from "../../src/i18n/index.ts";
import { expeditionSamples } from "../../src/designKit/samples.ts";
import { ExpeditionReportDialog } from "../../src/hud/ExpeditionReportDialog.tsx";

afterEach(cleanup);

const report = expeditionSamples.away.expeditions[0]!;

const renderReport = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <ExpeditionReportDialog report={report} onClose={() => {}} canShare onShare={() => {}} />
    </I18nextProvider>,
  );

describe("ExpeditionReportDialog", () => {
  it("shows one row per step with its sector icon, outcome and HP lost, in the terminal frame", () => {
    void i18n.changeLanguage("en");
    renderReport();
    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("terminal-popup")).toBe(true);
    const rows = dialog.querySelectorAll(".report-row");
    expect(rows).toHaveLength(report.events.length);
    for (const row of rows) expect(row.querySelector(".sector-icon")).not.toBeNull();
    const fight = rows[3]!;
    expect(fight.textContent).toContain("Alien zombies");
    // HP lost is its own list, not repeated in the outcome line.
    const hp = within(fight as HTMLElement).getAllByRole("listitem").map((li) => li.textContent);
    expect(hp).toEqual(["Kuan Ti −3 HP", "Chun −2 HP"]);
    expect(fight.querySelector("p")?.textContent).not.toContain("loses");
  });

  it("keeps the HP lines in the text it shares", () => {
    void i18n.changeLanguage("en");
    renderReport();
    fireEvent.click(screen.getByRole("button", { name: "Share the report" }));
    const text = (screen.getByRole("textbox") as HTMLTextAreaElement).value;
    expect(text).toContain("Kuan Ti loses 3 HP.");
  });
});
