import { describe, expect, it, vi } from "vitest";

// Each module in src, loaded first into an empty module graph. An import cycle only crashes ("Class extends value
// undefined", "Cannot access X before initialization") when the cycle is entered at the wrong module, so a test file
// that happens to import a different module first hides it; this tries every entry point.
const modules = import.meta.glob("../src/**/*.ts");

describe("every shared module", () => {
  it.each(Object.keys(modules))("loads on its own: %s", async (path) => {
    vi.resetModules();
    await expect(modules[path]!()).resolves.toBeDefined();
  });
});
