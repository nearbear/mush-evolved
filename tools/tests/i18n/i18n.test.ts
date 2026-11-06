import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCatalog, flatten, pluralCategories, usedKeys, type Catalog } from "../../src/i18n/catalog.ts";
import { findHardcodedUi, findHardcodedWire, stripComments } from "../../src/i18n/hardcoded.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BASELINE_FILE = resolve(import.meta.dirname, "../../src/i18n/baseline.json");
const LOCALES = ["en", "fr", "es"] as const;

// ---------------------------------------------------------------------------
// The checkers themselves, on small fixtures (so a broken checker can't pass
// quietly just because the real catalogs are still empty).
// ---------------------------------------------------------------------------

describe("checkCatalog", () => {
  const en: Catalog = {
    leave: "Leave",
    greeting: "Welcome, {{name}}",
    credits: "Art by <0>Motion Twin</0>",
    crew: { count_one: "{{count}} crew member", count_other: "{{count}} crew members" },
  };
  const es: Catalog = {
    leave: "Salir",
    greeting: "Bienvenido, {{name}}",
    credits: "Arte de <0>Motion Twin</0>",
    crew: {
      count_one: "{{count}} tripulante",
      count_many: "{{count}} de tripulantes",
      count_other: "{{count}} tripulantes",
    },
  };

  it("accepts a complete translation", () => {
    expect(checkCatalog(en, es, "es")).toEqual([]);
  });

  it("reports missing and extra keys", () => {
    expect(checkCatalog(en, { ...es, bonus: "Extra" }, "es")).toEqual(['extra key "bonus" (not in the reference catalog)']);
    const { leave: _, ...withoutLeave } = es;
    expect(checkCatalog(en, withoutLeave, "es")).toContain('missing key "leave"');
  });

  it("reports empty values", () => {
    expect(checkCatalog(en, { ...es, leave: "  " }, "es")).toContain('empty value for "leave"');
  });

  it("reports a changed or dropped placeholder", () => {
    expect(checkCatalog(en, { ...es, greeting: "Bienvenido, {{nombre}}" }, "es")).toEqual([
      '"greeting" uses [{{nombre}}] but the reference uses [{{name}}]',
    ]);
    expect(checkCatalog(en, { ...es, greeting: "Bienvenido" }, "es")).toHaveLength(1);
  });

  it("reports a changed or dropped Trans tag", () => {
    expect(checkCatalog(en, { ...es, credits: "Arte de Motion Twin" }, "es")).toHaveLength(1);
  });

  it("requires every plural form the language has (French and Spanish need 'many')", () => {
    expect(pluralCategories("en")).toEqual(new Set(["one", "other"]));
    expect(pluralCategories("fr")).toContain("many");
    expect(pluralCategories("es")).toContain("many");
    const noMany = { ...es, crew: { count_one: es.crew && "{{count}} tripulante", count_other: "{{count}} tripulantes" } } as Catalog;
    expect(checkCatalog(en, noMany, "es")).toEqual(['"crew.count" lacks the "many" plural form that es needs']);
  });

  it("reports a plural key translated as a single string, and the reverse", () => {
    expect(checkCatalog(en, { ...es, crew: { count: "{{count}} tripulantes" } }, "es")).toHaveLength(1);
    expect(checkCatalog(en, { ...es, leave: { leave_one: "Salir", leave_other: "Salir" } }, "es")).not.toEqual([]);
  });

  it("allows a plural form to leave out {{count}} as long as another form uses it", () => {
    const one = { ...es, crew: { ...(es.crew as Catalog), count_one: "un tripulante" } };
    expect(checkCatalog(en, one, "es")).toEqual([]);
  });
});

describe("flatten and usedKeys", () => {
  it("joins nested keys with dots", () => {
    expect(flatten({ a: { b: "x", c: { d: "y" } }, e: "z" })).toEqual({ "a.b": "x", "a.c.d": "y", e: "z" });
  });

  it("finds static keys, ignoring plural suffixes and namespaces", () => {
    const src = `t("lobby.title"); t('x'); <Trans i18nKey="credits" />; t("ui:crew.count_other"); t(dynamic)`;
    expect(usedKeys(src)).toEqual(["lobby.title", "crew.count", "credits"]);
  });
});

describe("findHardcodedUi", () => {
  const ui = (src: string) => findHardcodedUi(src, { jsx: true }).map((f) => f.text);

  it("flags text between JSX tags", () => {
    expect(ui(`<h2>Inspect</h2>`)).toEqual(["Inspect"]);
    expect(ui(`<p>\n  Nothing here.\n</p>`)).toEqual(["Nothing here."]);
  });

  it("flags sentence-like strings in expressions", () => {
    expect(ui(`const label = dead ? "Dead" : "Active";`)).toEqual(['"Dead"', '"Active"']);
    expect(ui("const s = `Move to ${room}`;")).toEqual(["`Move to ${room}`"]);
    expect(ui(`<button>{ready ? "Done" : "End cycle"}</button>`)).toEqual(['"Done"', '"End cycle"']);
  });

  it("flags words in title, aria-label, placeholder and alt attributes, even lowercase", () => {
    expect(ui(`<button aria-label="close" />`)).toEqual(['"close"']);
    expect(ui("<a title={ok ? `Go to ${room}` : room} />")).toEqual(["`Go to ${room}`"]);
    expect(ui(`<input placeholder="Message everyone…" />`)).toEqual(['"Message everyone…"']);
  });

  it("ignores translated and non-text code", () => {
    expect(ui(`<h2>{t("inspect.title")}</h2>`)).toEqual([]);
    expect(ui(`<button aria-label={t("close")} title={name} alt={p.name} />`)).toEqual([]);
    expect(ui(`<div className="Panel big" id="room-1" />`)).toEqual([]);
    expect(ui(`if (e.key === "Enter" || e.key !== "Escape") {}`)).toEqual([]);
    expect(ui(`import { App } from "../../src/i18n/App.tsx"; const x = lower("keys.only");`)).toEqual([]);
    expect(ui(`console.warn("Bot chose an illegal action"); throw new Error("Unknown player");`)).toEqual([]);
  });

  it("is not fooled by generics, comparisons, arrows or comments", () => {
    expect(ui(`const [a, b] = useState<string | null>(null); const c = new Map<string, Set<string>>();`)).toEqual([]);
    expect(ui(`const hit = items.filter((i) => i.id < max && count > min);`)).toEqual([]);
    expect(ui(`// <p>Hello there</p> and "Some Sentence"\n/* "Another Sentence" */ const glob = "./**/*.tsx";`)).toEqual([]);
  });

  it("honors i18n-ignore on the line or the line above, and reports line numbers", () => {
    expect(ui(`const a = "Español"; // i18n-ignore: language name`)).toEqual([]);
    expect(ui(`// i18n-ignore: language names are not translated\nconst a = "Español";`)).toEqual([]);
    expect(findHardcodedUi(`const ok = 1;\n\nconst a = "Hello world";`, { jsx: false })[0]?.line).toBe(3);
  });

  it("skips JSX-text detection in plain .ts files", () => {
    expect(findHardcodedUi(`const x = a > some && b < c;`, { jsx: false })).toEqual([]);
  });
});

describe("findHardcodedWire", () => {
  const wire = (src: string) => findHardcodedWire(src).map((f) => f.text);

  it("flags English in errors, messages, reasons, log text and returned sentences", () => {
    expect(wire(`return { ok: false, error: "Illegal action" };`)).toEqual(['"Illegal action"']);
    expect(wire(`send({ type: "error", message: "Slow down" });`)).toEqual(['"Slow down"']);
    expect(wire("return { ok: false, reason: `Limited to ${n} characters` };")).toHaveLength(1);
    expect(wire("logPublic(next, from, `${p.name} left for ${roomName(to)}.`);")).toHaveLength(1);
    expect(wire(`logPrivate(next, p.id, "You examine it.");`)).toHaveLength(1);
    expect(wire(`if (!this.game) return "No game";`)).toEqual(['"No game"']);
    expect(wire(`return { ok: false, error: "illegal_action" };`)).toEqual([]);
    expect(wire("return `the ${equipmentName(type)}`;")).toHaveLength(1);
    expect(wire(`wrench: { name: "Wrench" },`)).toEqual(['"Wrench"']);
  });

  it("ignores ids, codes, other fields and comments", () => {
    expect(wire(`return "global"; const t = { type: "error", code: "rate_limited" };`)).toEqual([]);
    expect(wire(`// error: "Not real"\nconst message = msg.text;`)).toEqual([]);
    expect(wire(`logPublic(next, from, t.key);`)).toEqual([]);
    expect(wire(`logPublic(next, from, "left", { name: p.name });`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The repository.
// ---------------------------------------------------------------------------

function sourceFiles(dir: string, extensions: string[]): string[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => extensions.some((e) => f.endsWith(e)) && !/\.test\.tsx?$|\.d\.ts$|^locales\//.test(f))
    .map((f) => `${dir}/${f}`)
    .sort();
}

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
/** Web's UI catalog with shared's names merged in, as web/src/i18n/index.ts does. */
const loadCatalog = (locale: string): Catalog => {
  const ui = JSON.parse(read(`web/src/locales/${locale}.json`)) as Catalog & { skills: Catalog };
  const names = JSON.parse(read(`shared/src/locales/names.${locale}.json`)) as Catalog & { skills: Catalog };
  return { ...ui, ...names, skills: { ...ui.skills, ...names.skills } };
};

describe("catalogs in web/src/locales and shared/src/locales", () => {
  const en = loadCatalog("en");

  it("English is internally consistent", () => {
    expect(checkCatalog(en, en, "en")).toEqual([]);
  });

  for (const locale of LOCALES.filter((l) => l !== "en")) {
    it(`${locale} matches English: same keys, placeholders and plural forms`, () => {
      expect(checkCatalog(en, loadCatalog(locale), locale)).toEqual([]);
    });
  }

  it("every key the web code asks for exists in English", () => {
    const known = new Set(Object.keys(flatten(en)).map((k) => k.replace(/_(zero|one|two|few|many|other)$/, "")));
    const unknown = sourceFiles("web/src", [".ts", ".tsx"]).flatMap((file) =>
      usedKeys(stripComments(read(file)))
        .filter((key) => !known.has(key))
        .map((key) => `${file}: ${key}`),
    );
    expect(unknown).toEqual([]);
  });
});

// A ratchet: files may not gain hardcoded text, and when they lose some the
// baseline must drop with them, so cleanups stay cleaned up. After translating
// strings (or deliberately adding one), run:
//   UPDATE_I18N_BASELINE=1 npm test -w tools -- i18n
type Baseline = { ui: Record<string, number>; wire: Record<string, number> };

describe("hardcoded English text", () => {
  const ui = Object.fromEntries(
    sourceFiles("web/src", [".ts", ".tsx"])
      // The ship map editor is a dev-only tool (never in a production build), in English only.
      // So is the mush2 design kit page, whose sample text never ships.
      .filter((file) => !file.startsWith("web/src/editor/") && !file.startsWith("web/src/designKit/"))
      .map((file) => [file, findHardcodedUi(read(file), { jsx: file.endsWith(".tsx") })]),
  );
  const wire = Object.fromEntries(
    [...sourceFiles("shared/src", [".ts"]), ...sourceFiles("server/src", [".ts"])]
      // Crew names are proper nouns.
      .filter((file) => !file.endsWith("/characters.ts"))
      .map((file) => [file, findHardcodedWire(read(file))]),
  );
  const counts = (found: typeof ui) =>
    Object.fromEntries(Object.entries(found).flatMap(([file, hits]) => (hits.length ? [[file, hits.length]] : [])));
  const current: Baseline = { ui: counts(ui), wire: counts(wire) };

  if (process.env.UPDATE_I18N_BASELINE) {
    writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2) + "\n");
  }
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline;

  function ratchet(kind: keyof Baseline, found: typeof ui) {
    const grew: string[] = [];
    const shrank: string[] = [];
    for (const file of new Set([...Object.keys(found), ...Object.keys(baseline[kind])])) {
      const now = found[file]?.length ?? 0;
      const was = baseline[kind][file] ?? 0;
      if (now > was) {
        grew.push(`${file}: ${was} -> ${now}\n${found[file]!.map((f) => `    line ${f.line}: ${f.text}`).join("\n")}`);
      } else if (now < was) {
        shrank.push(`${file}: ${was} -> ${now}`);
      }
    }
    return { grew, shrank };
  }

  it("client code does not gain hardcoded text (use t() and add the key to every locale)", () => {
    const { grew } = ratchet("ui", ui);
    expect(grew, "New hardcoded text. Translate it, or add `i18n-ignore` if it should not be translated.").toEqual([]);
  });

  it("shared and server code do not gain English sentences (send structured events or error codes)", () => {
    const { grew } = ratchet("wire", wire);
    expect(grew, "New English text in rules or server code. Emit a key and params instead.").toEqual([]);
  });

  it("the baseline is current (lower it after removing hardcoded text)", () => {
    const shrank = [...ratchet("ui", ui).shrank, ...ratchet("wire", wire).shrank];
    expect(shrank, "Progress! Run: UPDATE_I18N_BASELINE=1 npm test -w tools -- i18n").toEqual([]);
  });
});
