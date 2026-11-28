import i18next from "i18next";
import { SOMEONE } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { logGenderContext } from "../../src/i18n/logContext.ts";

describe("logGenderContext (#505)", () => {
  it("uses the actor's gender", () => {
    expect(logGenderContext("entered", { name: "paola" })).toBe("female");
    expect(logGenderContext("entered", { name: "chao", target: "paola" })).toBe("male");
  });

  it("gives no context for a masked actor, an unknown character, or a line without one", () => {
    expect(logGenderContext("entered", { name: SOMEONE })).toBeUndefined();
    expect(logGenderContext("entered", { name: "andie" })).toBeUndefined();
    expect(logGenderContext("fireStarted", { room: "bridge" })).toBeUndefined();
  });

  it("falls back to the plain, gender-free key when a variant is missing", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "fr",
      interpolation: { escapeValue: false },
      resources: { fr: { translation: { entered: "{{name}} fait son entrée.", entered_female: "{{name}} est entrée." } } },
    });
    const line = (name: string, given: string) => i18n.t("entered", { name: given, context: logGenderContext("entered", { name }) });
    expect(line("paola", "Paola")).toBe("Paola est entrée.");
    expect(line("chao", "Chao")).toBe("Chao fait son entrée.");
    expect(line(SOMEONE, "quelqu'un")).toBe("quelqu'un fait son entrée.");
  });
});
