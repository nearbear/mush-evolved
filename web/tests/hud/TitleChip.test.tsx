import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TITLE_ICONS } from "../../src/art/assets.ts";
import { ShipResources } from "../../src/hud/ShipResources.tsx";
import { TitleSuccession } from "../../src/hud/TitleChip.tsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("../../src/i18n/names.ts", () => ({
  useNames: () => ({
    title: (id: string) => id,
    characterGiven: (id: string) => id,
  }),
}));

describe("TitleSuccession", () => {
  it("marks players before the holder as lost, the holder as holder, and later players as plain", () => {
    const out = renderToStaticMarkup(
      <TitleSuccession entry={{ id: "commander", holder: "gioele", line: ["jinsu", "chao", "gioele", "stephen"] }} />,
    );
    expect(out).toBe(
      '<ol><li class="lost">jinsu</li><li class="lost">chao</li><li class="holder">gioele</li><li>stephen</li></ol>',
    );
  });

  it("does not mark anyone as lost while vacant during preselection", () => {
    const out = renderToStaticMarkup(
      <TitleSuccession entry={{ id: "commander", holder: null, line: ["jinsu", "chao"] }} preselection />,
    );
    expect(out).toBe("<ol><li>jinsu</li><li>chao</li></ol>");
  });

  it("marks everyone as lost when vacant after preselection", () => {
    const out = renderToStaticMarkup(
      <TitleSuccession entry={{ id: "commander", holder: null, line: ["jinsu", "chao"] }} preselection={false} />,
    );
    expect(out).toBe('<ol><li class="lost">jinsu</li><li class="lost">chao</li></ol>');
  });
});

describe("ShipResources compactTitles", () => {
  const ship = { oxygen: 24, fuel: 24, hull: 100, plasmaShield: 0, max: { oxygen: 32, fuel: 24, hull: 100, plasmaShield: 20 } };
  const titles = [
    { id: "commander" as const, holder: "jinsu" as const, line: ["jinsu" as const, "chao" as const] },
    { id: "neron_admin" as const, holder: "janice" as const, line: ["janice" as const] },
    { id: "comms_officer" as const, holder: "paola" as const, line: ["paola" as const] },
  ];
  const alerts = { fires: 0, broken: 0, reports: [], gravity: null };

  it("renders a single commander-icon button on desktop when compactTitles is set", () => {
    const out = renderToStaticMarkup(
      <ShipResources ship={ship} hunters={0} titles={titles} compactTitles orbit={null} expedition={null} lost={[]} alerts={alerts} />,
    );
    expect(out.match(/class="ship-title"/g)).toHaveLength(1);
    expect(out).toContain('class="ship-titles-button"');
    expect(out).toContain(TITLE_ICONS.commander);
    expect(out).not.toContain("jinsu");
  });

  it("renders one chip per title when compactTitles is omitted", () => {
    const out = renderToStaticMarkup(
      <ShipResources ship={ship} hunters={0} titles={titles} orbit={null} expedition={null} lost={[]} alerts={alerts} />,
    );
    expect(out.match(/class="ship-title"/g)).toHaveLength(3);
    expect(out).toContain("jinsu");
    expect(out).toContain("janice");
    expect(out).toContain("paola");
  });
});
