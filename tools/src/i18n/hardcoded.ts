// Finds user-facing English text that is still written into the source instead
// of coming from a translation catalog. These are heuristics (regexes, not a
// parser), tuned to this codebase: they err toward flagging, and a line that is
// fine can carry an `i18n-ignore` comment (on the line itself, or alone on the
// line above). The test compares counts against a baseline, so nothing here
// has to be perfect, only stable.

export interface Finding {
  line: number;
  text: string;
}

const LETTERS = /[A-Za-zÀ-ɏ]{2,}/;
const STRING = /"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/;
const LITERAL = new RegExp(STRING, "g");

const blank = (s: string) => s.replace(/[^\n]/g, " ");
const withoutInterpolation = (s: string) => s.replace(/\$\{[^}]*\}/g, "").replace(/\{\{[^}]*\}\}/g, "");

/** Replaces comments with spaces so indexes and line numbers stay the same. */
export function stripComments(src: string): string {
  return src
    .replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, blank) // not the `/*` inside a glob like "./**/*.tsx"
    .replace(/(^|[ \t])\/\/[^\n]*/gm, blank); // not the `//` in "https://..."
}

function ignoredLines(src: string): Set<number> {
  const out = new Set<number>();
  src.split("\n").forEach((text, i) => {
    if (!text.includes("i18n-ignore")) return;
    out.add(i + 1);
    if (/^\s*(\/\/|\{?\/\*)/.test(text)) out.add(i + 2);
  });
  return out;
}

const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;
const lineTextAt = (src: string, index: number) => {
  const start = src.lastIndexOf("\n", index) + 1;
  const end = src.indexOf("\n", index);
  return src.slice(start, end < 0 ? undefined : end);
};

function finish(src: string, hits: Map<number, string>): Finding[] {
  const ignored = ignoredLines(src);
  return [...hits]
    .sort((a, b) => a[0] - b[0])
    .map(([index, text]) => ({ line: lineOf(src, index), text: text.trim().replace(/\s+/g, " ") }))
    .filter((f) => !ignored.has(f.line));
}

/** Source ranges of the values of attributes that screen readers and tooltips show to people. */
function textAttributeSpans(code: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of code.matchAll(/\b(?:title|aria-label|aria-description|placeholder|alt)\s*=\s*/g)) {
    const start = m.index! + m[0].length;
    if (code[start] === '"') {
      const end = code.indexOf('"', start + 1);
      if (end > 0) spans.push([start, end + 1]);
    } else if (code[start] === "{") {
      let depth = 0;
      let i = start;
      for (; i < code.length; i++) {
        if (code[i] === "{") depth++;
        else if (code[i] === "}" && --depth === 0) break;
      }
      spans.push([start, i + 1]);
    }
  }
  return spans;
}

/**
 * Client code. Flags:
 *  - text between JSX tags (`.tsx` only): `<h2>Inspect</h2>`
 *  - any string in a title/aria-label/placeholder/alt attribute that has words
 *  - any string literal that starts like a sentence ("Dead", `Move to ${x}`),
 *    except in comparisons, imports, and developer-facing console/Error text.
 */
export function findHardcodedUi(src: string, { jsx }: { jsx: boolean }): Finding[] {
  const code = stripComments(src);
  const hits = new Map<number, string>();

  if (jsx) {
    for (const m of code.matchAll(/(?<![=-])>([^<>{}]+)</g)) {
      const text = m[1]!.trim();
      if (!/^[A-Za-zÀ-ɏ"“¿¡]/.test(text) || /&&|\|\||=>|;/.test(text) || !LETTERS.test(text)) continue;
      hits.set(m.index!, text);
    }
  }

  const spans = textAttributeSpans(code);
  for (const m of code.matchAll(LITERAL)) {
    const start = m.index!;
    const body = withoutInterpolation(m[0].slice(1, -1));
    const inTextAttribute = spans.some(([a, b]) => start >= a && start < b);
    const sentenceLike = /^\s*[A-ZÀ-Þ][a-zß-ÿ]/.test(body);
    if (!(inTextAttribute ? LETTERS.test(body) : sentenceLike)) continue;
    // Comparisons and imports aren't display text, and the argument of t("...") is a key, not text.
    if (/(===?|!==?|\bcase|\bfrom|\bimport|\bt\(|i18nKey=|className=)\s*$/.test(code.slice(Math.max(0, start - 12), start))) continue;
    if (/\bconsole\.|\bthrow new\b|\bnew Error\(|\bimport\b/.test(lineTextAt(code, start))) continue;
    hits.set(start, m[0]);
  }

  return finish(src, hits);
}

const KEYED = new RegExp(`\\b(?:error|message|reason|text|name|label)\\s*:\\s*(${STRING.source})`, "g");
const LOGGED = new RegExp(`\\blog(?:Public|Private)\\((?:[^,()]+,){2}\\s*(${STRING.source})`, "g");
const RETURNED = new RegExp(`\\breturn\\s+(${STRING.source})`, "g");

/**
 * Shared rules and server code. Flags English text that would travel to a
 * client: `error:`/`message:`/`reason:`/`text:`/`name:`/`label:` values, the
 * text argument of logPublic/logPrivate, and returned sentences.
 */
export function findHardcodedWire(src: string): Finding[] {
  const code = stripComments(src);
  const hits = new Map<number, string>();
  for (const pattern of [KEYED, LOGGED, RETURNED]) {
    for (const m of code.matchAll(pattern)) {
      const literal = m[1]!;
      const body = withoutInterpolation(literal.slice(1, -1));
      if (!LETTERS.test(body)) continue;
      // `return "global"` is an id; `return "Slow down"` and `return `the ${x}`` are sentences.
      // Likewise logPublic(state, room, "left", ...) passes a message id, not text.
      if (pattern !== KEYED && !(/\s/.test(body) || /^[A-Z]/.test(body))) continue;
      hits.set(m.index!, literal);
    }
  }
  return finish(src, hits);
}
