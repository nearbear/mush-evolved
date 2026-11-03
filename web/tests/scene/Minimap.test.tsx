import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Minimap", () => {
  let Minimap: typeof import("../../src/scene/Minimap.tsx").Minimap;

  beforeAll(async () => {
    vi.stubGlobal("document", { documentElement: { lang: "en" } });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
    });
    const i18n = (await import("../../src/i18n/index.ts")).default;
    await i18n.changeLanguage("en");
    Minimap = (await import("../../src/scene/Minimap.tsx")).Minimap;
  });

  afterAll(() => vi.unstubAllGlobals());

  it("renders non-burning rooms without burning class", () => {
    const markup = renderToStaticMarkup(
      <Minimap
        here="BRIDGE"
        youId="p0"
        people={[]}
        unidentified={[]}
        reachable={new Set()}
        burningRooms={[]}
      />,
    );
    expect(markup).not.toContain("minimap-room burning");
  });

  it("marks burning rooms with burning class", () => {
    const markup = renderToStaticMarkup(
      <Minimap
        here="BRIDGE"
        youId="p0"
        people={[]}
        unidentified={[]}
        reachable={new Set()}
        burningRooms={["REFECTORY"]}
      />,
    );
    expect(markup).toContain("minimap-room burning");
  });
});
