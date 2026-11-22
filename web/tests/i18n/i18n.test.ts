import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LOCALE_KEY, matchLocale, pickLocale } from "../../src/i18n/locale.ts";

describe("matchLocale", () => {
  it("accepts region and case variants, and rejects languages we don't ship", () => {
    expect(matchLocale("fr")).toBe("fr");
    expect(matchLocale("fr-CA")).toBe("fr");
    expect(matchLocale("ES_mx")).toBe("es");
    expect(matchLocale("en-GB")).toBe("en");
    expect(matchLocale("de")).toBeNull();
    expect(matchLocale("")).toBeNull();
    expect(matchLocale(null)).toBeNull();
  });
});

describe("pickLocale", () => {
  it("prefers the saved choice over the browser", () => {
    expect(pickLocale("es", ["fr-FR", "en"])).toBe("es");
  });

  it("uses the first browser language we ship, skipping ones we don't", () => {
    expect(pickLocale(null, ["de-DE", "fr-CA", "es"])).toBe("fr");
  });

  it("ignores a saved value that is no longer a supported language", () => {
    expect(pickLocale("klingon", ["es"])).toBe("es");
  });

  it("falls back to English", () => {
    expect(pickLocale(null, [])).toBe("en");
    expect(pickLocale(null, ["de", "ja"])).toBe("en");
  });
});

describe("i18n runtime", () => {
  const store = new Map<string, string>([[LOCALE_KEY, "fr"]]);
  const html = { lang: "" };
  let i18n: typeof import("i18next").default;

  beforeAll(async () => {
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal("document", { documentElement: html });
    i18n = (await import("../../src/i18n/index.ts")).default;
  });
  afterAll(() => vi.unstubAllGlobals());

  it("starts in the saved language, loading only that locale with <html lang> set", () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toBe("fr");
    expect(i18n.hasResourceBundle("fr", "translation")).toBe(true);
    expect(i18n.hasResourceBundle("en", "translation")).toBe(false);
    expect(i18n.hasResourceBundle("es", "translation")).toBe(false);
    expect(i18n.t("nav.room")).toBe("Salle");
    expect(i18n.t("rooms.COMMAND_CENTER")).toBe("Pont");
    expect(html.lang).toBe("fr");
  });

  it("loads another locale on demand when switching language, remembers it, and updates <html lang>", async () => {
    await i18n.changeLanguage("es");
    expect(i18n.hasResourceBundle("es", "translation")).toBe(true);
    expect(i18n.hasResourceBundle("en", "translation")).toBe(false);
    expect(i18n.t("nav.room")).toBe("Sala");
    expect(i18n.t("rooms.COMMAND_CENTER")).toBe("Puente");
    expect(html.lang).toBe("es");
    expect(store.get(LOCALE_KEY)).toBe("es");
  });

  it("fills in placeholders", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("lobby.waiting", { waiting: 2, seats: 8 })).toContain("2/8");
  });
});
