// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { viewFor } from "@mush2/shared";

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
import { StatInfo, type Stat } from "../../src/hud/StatInfo.tsx";
import { sampleState } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

/** Opens `stat`'s card for p0 with `modifiers` (statuses) and returns its popup's text. */
function openCard(stat: Stat, modifiers: string[], skills: string[] = []): string {
  const s = sampleState();
  const p = s.players[0]!;
  p.role = "human";
  p.modifiers = modifiers;
  p.skills = skills;
  const view = viewFor(s, "p0");
  render(
    <I18nextProvider i18n={i18n}>
      <StatInfo stat={stat} view={view} value={1} max={view.caps[stat].max}>
        <span>stat</span>
      </StatInfo>
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
  return document.querySelector(".stat-info-card, .resource-card")!.textContent ?? "";
}

describe("StatInfo cap changes (#267)", () => {
  it("names each source that lowers a cap, with its real change and icon, and divides the help text", async () => {
    await i18n.changeLanguage("en");
    const text = openCard("hp", ["cold_disease", "broken_leg_injury", "flu_disease"]);
    expect(text).toContain("Max HP: 14 → 10");
    expect(text).toContain("Broken Leg -1");
    expect(text).toContain("Flu -3");
    expect(text).not.toContain("Cold"); // cold changes morale only
    const icons = [...document.querySelectorAll(".stat-cap li img")].map((img) => img.getAttribute("src") ?? "");
    expect(icons).toHaveLength(2);
    expect(icons[0]).toContain("hurt");
    expect(icons[1]).toContain("disease");
    expect(document.querySelector(".stat-info-help-divided")).not.toBeNull();
  });

  it("shows the morale cap and its sources on the morale card", async () => {
    await i18n.changeLanguage("en");
    const text = openCard("morale", ["cold_disease"]);
    expect(text).toContain("Max Morale: 14 → 11");
    expect(text).toContain("Cold -3");
  });

  it("names a skill source by its skill name", async () => {
    await i18n.changeLanguage("en");
    const text = openCard("ap", [], ["lethargy"]);
    expect(text).toContain("Max AP: 12 → 24");
    expect(text).toContain("Lethargy +12");
  });

  it("says nothing about the cap and omits the divider when nothing changes it", async () => {
    await i18n.changeLanguage("en");
    expect(openCard("ap", [])).not.toContain("→");
    expect(document.querySelector(".stat-info-help-divided")).toBeNull();
  });

  it("uses the French template", async () => {
    await i18n.changeLanguage("fr");
    const text = openCard("mp", ["broken_leg_injury"]);
    await i18n.changeLanguage("en");
    expect(text).toMatch(/PM max : \d+ → \d+/);
  });
});
