// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

import "../../src/i18n/index.ts";
import i18n from "../../src/i18n/index.ts";
import { ITrackie } from "../../src/hud/ITrackie.tsx";
import { sampleState, sampleView } from "../../src/designKit/sampleView.ts";

afterEach(cleanup);

describe("ITrackie room log empty state", () => {
  it("renders a muted caption when the room log has no entries", () => {
    const view = { ...sampleView(sampleState()), log: [] };
    render(
      <I18nextProvider i18n={i18n}>
        <ITrackie view={view} roomLogRequest={0} onChat={() => {}} onCreateThread={() => {}} onToggle={() => {}} quiet />
      </I18nextProvider>,
    );
    const caption = screen.getByText("No events yet.");
    expect(caption.tagName).toBe("P");
    expect(caption.className).toBe("sub");
  });
});
