import { describe, expect, it } from "vitest";
import { crossOriginUpgrade } from "../src/origin.ts";

const req = (headers: Record<string, string>, url = "https://game.example/parties/matchmaker/en") => new Request(url, { headers });
const ws = { Upgrade: "websocket" };

describe("crossOriginUpgrade", () => {
  it("allows a same-origin upgrade", () => {
    expect(crossOriginUpgrade(req({ ...ws, Origin: "https://game.example" }))).toBe(false);
  });
  it("refuses another site's upgrade", () => {
    expect(crossOriginUpgrade(req({ ...ws, Origin: "https://evil.example" }))).toBe(true);
  });
  it("refuses a sibling subdomain, a different port, and an opaque origin", () => {
    expect(crossOriginUpgrade(req({ ...ws, Origin: "https://a.game.example" }))).toBe(true);
    expect(crossOriginUpgrade(req({ ...ws, Origin: "https://game.example:8443" }))).toBe(true);
    expect(crossOriginUpgrade(req({ ...ws, Origin: "null" }))).toBe(true);
  });
  it("allows a client that sends no Origin (bots, tooling)", () => {
    expect(crossOriginUpgrade(req(ws))).toBe(false);
  });
  it("leaves non-upgrade requests alone", () => {
    expect(crossOriginUpgrade(req({ Origin: "https://evil.example" }))).toBe(false);
  });
});
