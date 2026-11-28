// Checks on translation catalogs (web/src/locales/<lang>.json merged with shared/src/locales/names.<lang>.json, i18next JSON v4).
// English is the reference; every other language must have the same keys, the
// same placeholders, and every plural form its language needs. Gendered variants
// (`key_female`, `key_male`, #505) are optional per language, but each needs a
// plain key to fall back to.

export type Catalog = { [key: string]: string | Catalog };

/** Plural suffixes i18next appends to a key: `crew_one`, `crew_many`, `crew_other`. */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
// `{{name}}`, `{{- name}}` (unescaped), `{{n, number}}`.
const PLACEHOLDER = /\{\{\s*-?\s*([\w.]+)\s*(?:,[^}]*)?\}\}/g;
// `<0>link</0>`, `<1/>`, or named tags such as `<b>`, used by react-i18next's Trans.
const TAG = /<\/?\s*(\w+)\s*\/?>/g;

/** Nested catalog -> `{ "lobby.title": "..." }`, with `.` as the key separator (the i18next default). */
export function flatten(catalog: Catalog, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

export const baseKey = (key: string) => key.replace(PLURAL_SUFFIX, "");

/** The gender context i18next puts before any plural suffix: `entered_female`, `crew_male_one`. */
const GENDER_SUFFIX = /_(male|female)(?=(_(zero|one|two|few|many|other))?$)/;
/** `entered_female` -> `entered`, `crew_male_one` -> `crew_one`; other keys unchanged. */
export const withoutGender = (key: string) => key.replace(GENDER_SUFFIX, "");
const pluralForm = (key: string) => PLURAL_SUFFIX.exec(key)?.[1];

/** Everything a translation must carry over unchanged: placeholders and Trans tags. */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) out.add(`{{${m[1]}}}`);
  for (const m of text.matchAll(TAG)) out.add(`<${m[1]}>`);
  return out;
}

/** Plural categories a language needs: English has one/other, French and Spanish also have many. */
export const pluralCategories = (locale: string) => new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);

interface Group {
  /** form ("one", "other") or "" for a key with no plural forms -> text */
  forms: Map<string, string>;
}

function groupByBase(flat: Record<string, string>): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const [key, text] of Object.entries(flat)) {
    const base = baseKey(key);
    const group = groups.get(base) ?? { forms: new Map() };
    group.forms.set(pluralForm(key) ?? "", text);
    groups.set(base, group);
  }
  return groups;
}

const union = (group: Group) => {
  const all = new Set<string>();
  for (const text of group.forms.values()) for (const t of tokens(text)) all.add(t);
  return [...all].sort();
};

/** Problems with `catalog` for `locale`, judged against the `reference` catalog. Empty = fine. */
export function checkCatalog(reference: Catalog, catalog: Catalog, locale: string): string[] {
  const problems: string[] = [];
  const plain = (flat: Record<string, string>) => Object.fromEntries(Object.entries(flat).filter(([k]) => !GENDER_SUFFIX.test(k)));
  const ownFlat = flatten(catalog);
  const ref = groupByBase(plain(flatten(reference)));
  const own = groupByBase(plain(ownFlat));
  const needed = pluralCategories(locale);

  // Gendered variants: a language may have them or not, but each needs a plain key (gender-free
  // wording) to fall back to, and must carry the same placeholders and plural shape as that key.
  const gendered = groupByBase(Object.fromEntries(Object.entries(ownFlat).filter(([k]) => GENDER_SUFFIX.test(k))));
  for (const [variant, group] of gendered) {
    const base = withoutGender(variant);
    const plainGroup = own.get(base);
    if (!plainGroup) {
      problems.push(`"${variant}" has no plain key "${base}" to fall back to (it must hold gender-free wording)`);
      continue;
    }
    for (const [form, text] of group.forms) if (!text.trim()) problems.push(`empty value for "${variant}"${form ? ` (${form})` : ""}`);
    const isPlural = !group.forms.has("");
    if (isPlural !== !plainGroup.forms.has("")) {
      problems.push(`"${variant}" is ${isPlural ? "plural" : "not plural"} but "${base}" is ${isPlural ? "not " : ""}plural`);
    } else if (isPlural) {
      for (const category of needed) if (!group.forms.has(category)) problems.push(`"${variant}" lacks the "${category}" plural form that ${locale} needs`);
    }
    const refGroup = ref.get(base);
    if (refGroup) {
      const want = union(refGroup).join(" ");
      const have = union(group).join(" ");
      if (want !== have) problems.push(`"${variant}" uses [${have}] but the reference uses [${want}]`);
    }
  }

  for (const base of ref.keys()) if (!own.has(base)) problems.push(`missing key "${base}"`);

  for (const [base, group] of own) {
    const refGroup = ref.get(base);
    if (!refGroup) {
      problems.push(`extra key "${base}" (not in the reference catalog)`);
      continue;
    }

    for (const [form, text] of group.forms) {
      if (!text.trim()) problems.push(`empty value for "${base}"${form ? ` (${form})` : ""}`);
    }

    const isPlural = !group.forms.has("");
    if (isPlural !== !refGroup.forms.has("")) {
      problems.push(`"${base}" is ${isPlural ? "plural" : "not plural"} here but ${isPlural ? "not " : ""}plural in the reference`);
    } else if (isPlural) {
      for (const category of needed) {
        if (!group.forms.has(category)) problems.push(`"${base}" lacks the "${category}" plural form that ${locale} needs`);
      }
    }

    const want = union(refGroup).join(" ");
    const have = union(group).join(" ");
    if (want !== have) problems.push(`"${base}" uses [${have}] but the reference uses [${want}]`);
  }
  return problems;
}

/** Keys that `t("...")` or `i18nKey="..."` calls in a source file refer to (static ones only). */
export function usedKeys(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/\bt\(\s*"([^"]+)"/g)) out.push(m[1]!);
  for (const m of source.matchAll(/\bi18nKey=\s*"([^"]+)"/g)) out.push(m[1]!);
  return out.map((k) => baseKey(k.includes(":") ? k.slice(k.indexOf(":") + 1) : k));
}
