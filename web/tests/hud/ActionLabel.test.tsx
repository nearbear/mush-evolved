import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ACTION_ICON, RESOURCE_ICONS } from "../../src/art/assets.ts";
import { ActionLabel } from "../../src/hud/ActionLabel.tsx";

describe("ActionLabel", () => {
  it("shows the icon of the resource that pays for a free action, not the AP icon", () => {
    const out = renderToStaticMarkup(<ActionLabel text="Work" cost={{ ap: 0, mp: 0, paidBy: "comp" }} />);
    expect(out).toContain(RESOURCE_ICONS.comp);
    expect(out).not.toContain(ACTION_ICON);
  });

  it("shows the AP cost and no resource icon when AP pays", () => {
    const out = renderToStaticMarkup(<ActionLabel text="Work" cost={{ ap: 2, mp: 0 }} />);
    expect(out).toContain(ACTION_ICON);
    for (const icon of Object.values(RESOURCE_ICONS)) expect(out).not.toContain(icon);
  });
});
