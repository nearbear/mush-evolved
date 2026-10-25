import { describe, expect, it } from "vitest";
import { parseGameMessage } from "../src/protocol.ts";

const parse = (msg: unknown) => parseGameMessage(JSON.stringify(msg));

describe("model key messages (BYOK)", () => {
  const ok = { type: "setModel", provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", apiKey: "sk-or-v1-abc123" };

  it("parses setModel and clearModel, dropping anything extra", () => {
    expect(parse({ ...ok, baseUrl: "https://evil.test" })).toEqual(ok);
    expect(parse({ type: "clearModel", apiKey: "x" })).toEqual({ type: "clearModel" });
  });

  it("refuses providers off the allowlist, and keys or model names that could break the request", () => {
    expect(parse({ ...ok, provider: "https://evil.test/v1" })).toBeNull();
    expect(parse({ ...ok, apiKey: "" })).toBeNull();
    expect(parse({ ...ok, apiKey: "sk-1\r\nx-evil: 1" })).toBeNull();
    expect(parse({ ...ok, apiKey: "a".repeat(513) })).toBeNull();
    expect(parse({ ...ok, model: "" })).toBeNull();
    expect(parse({ ...ok, model: 'm", "max_tokens": 99999' })).toBeNull();
    expect(parse({ ...ok, model: 3 })).toBeNull();
  });
});
