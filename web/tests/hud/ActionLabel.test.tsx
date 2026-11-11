import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ACTION_ICON, RESOURCE_ICONS, VISIBILITY_ICONS } from "../../src/art/assets.ts";
import { ActionLabel } from "../../src/hud/ActionLabel.tsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { percent?: number; resource?: string }) => {
      if (opts?.percent !== undefined) return `(${opts.percent}%)`;
      if (opts?.resource !== undefined) return `paid with ${opts.resource}`;
      return key;
    },
  }),
}));

describe("ActionLabel", () => {
  it("shows the icon of the resource that pays for a free action, not the AP icon", () => {
    const out = renderToStaticMarkup(<ActionLabel text="Work" cost={{ ap: 0, mp: 0, paidBy: "comp" }} />);
    expect(out).toContain(RESOURCE_ICONS.comp);
    expect(out).not.toContain(ACTION_ICON);
    expect(out).toContain("paid with resources.comp.name");
  });

  it("shows the AP cost and no resource icon when AP pays", () => {
    const out = renderToStaticMarkup(<ActionLabel text="Work" cost={{ ap: 2, mp: 0 }} />);
    expect(out).toContain(ACTION_ICON);
    expect(out).toContain("2");
    for (const icon of Object.values(RESOURCE_ICONS)) expect(out).not.toContain(icon);
  });

  it("shows no AP cost or resource icon for completely free actions", () => {
    const out = renderToStaticMarkup(<ActionLabel text="Talk" cost={{ ap: 0, mp: 0 }} />);
    expect(out).not.toContain(ACTION_ICON);
    for (const icon of Object.values(RESOURCE_ICONS)) expect(out).not.toContain(icon);
  });

  it("renders success probability when chance is below 100%", () => {
    const out = renderToStaticMarkup(<ActionLabel text="Punch" cost={{ ap: 1, mp: 0 }} chance={0.6} />);
    expect(out).toContain("action-chance");
    expect(out).toContain("(60%)");
  });

  it("omits success probability when chance is 1 (100%)", () => {
    const out = renderToStaticMarkup(<ActionLabel text="Punch" cost={{ ap: 1, mp: 0 }} chance={1} />);
    expect(out).not.toContain("action-chance");
  });

  it("shows visibility badge for non-public actions", () => {
    const covert = renderToStaticMarkup(<ActionLabel text="Infect" cost={{ ap: 2, mp: 0 }} visibility="covert" />);
    expect(covert).toContain(VISIBILITY_ICONS.covert);
    expect(covert).toContain('alt="actions.visibility.covert"');

    const secret = renderToStaticMarkup(<ActionLabel text="Spore" cost={{ ap: 2, mp: 0 }} visibility="secret" />);
    expect(secret).toContain(VISIBILITY_ICONS.secret);
    expect(secret).toContain('alt="actions.visibility.secret"');

    const priv = renderToStaticMarkup(<ActionLabel text="Wash" cost={{ ap: 2, mp: 0 }} visibility="private" />);
    expect(priv).toContain(VISIBILITY_ICONS.private);
    expect(priv).toContain('alt="actions.visibility.private"');
  });

  it("omits visibility badge for public actions", () => {
    const pub = renderToStaticMarkup(<ActionLabel text="Speak" cost={{ ap: 0, mp: 0 }} visibility="public" />);
    for (const icon of Object.values(VISIBILITY_ICONS)) expect(pub).not.toContain(icon);
  });
});
