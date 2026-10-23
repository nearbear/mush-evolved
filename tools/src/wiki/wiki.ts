// Reads eMushpedia, the French eMush wiki (https://emushpedia.miraheze.org), through its MediaWiki API.
// `npm run wiki -- search <words>` lists matching titles (accent- and case-insensitive substrings, which the
// wiki's own search can't do) and then the wiki's full-text hits (whole words only). `npm run wiki -- page
// <title>` prints a page's wikitext, following redirects, with inline icon templates flattened to text; add
// `--section <heading>` for one section, or `--raw` for the wikitext as stored. Wiki text is CC BY-SA content
// from other people: quote it as a source for the owner, never as a decided rule.

const API = "https://emushpedia.miraheze.org/w/api.php";
const PAGE_URL = "https://emushpedia.miraheze.org/wiki/";

// biome-ignore lint/suspicious/noExplicitAny: untyped MediaWiki API responses, only read for printing.
type Json = Record<string, any>;

async function api(params: Record<string, string>): Promise<Json> {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: "json", formatversion: "2" })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "User-Agent": "mush2-dev-tools (rules reference)" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  const body = (await res.json()) as Json;
  if (body.error) throw new Error(`${body.error.code}: ${body.error.info}`);
  return body;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Every main-namespace title, with redirects marked. */
async function allTitles(): Promise<{ title: string; redirect: boolean }[]> {
  const out: { title: string; redirect: boolean }[] = [];
  let cont: Json = {};
  for (;;) {
    const body = await api({ action: "query", list: "allpages", aplimit: "500", apnamespace: "0", ...cont });
    for (const p of body.query.allpages) out.push({ title: p.title, redirect: false });
    if (!body.continue) break;
    cont = body.continue;
  }
  const fromRedirects = await redirectSources();
  return out.map((p) => ({ ...p, redirect: fromRedirects.has(p.title) }));
}

async function redirectSources(): Promise<Set<string>> {
  const out = new Set<string>();
  let cont: Json = {};
  for (;;) {
    const body = await api({
      action: "query",
      list: "allpages",
      apfilterredir: "redirects",
      aplimit: "500",
      apnamespace: "0",
      ...cont,
    });
    for (const p of body.query.allpages) out.add(p.title);
    if (!body.continue) break;
    cont = body.continue;
  }
  return out;
}

async function search(words: string): Promise<void> {
  const needle = fold(words);
  const titles = (await allTitles()).filter((p) => fold(p.title).includes(needle));
  console.log(`Titles containing "${words}" (${titles.length}):`);
  for (const p of titles.slice(0, 40)) console.log(`  ${p.title}${p.redirect ? "  (redirect)" : ""}`);
  if (titles.length > 40) console.log(`  ... ${titles.length - 40} more`);

  const body = await api({ action: "query", list: "search", srsearch: words, srlimit: "20", srwhat: "text" });
  const hits: Json[] = body.query.search;
  console.log(`\nFull-text hits (${body.query.searchinfo.totalhits}, whole words only):`);
  for (const h of hits) {
    const snippet = String(h.snippet)
      .replace(/<[^>]+>/g, "")
      .replace(/&#0?39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    console.log(`  ${h.title}: ${snippet.slice(0, 120)}`);
  }
}

/** `{{PA}}` -> `PA`, `{{Objet|Couteau|16}}` -> `Couteau`; templates with named parameters (infoboxes) are kept. */
function flatten(wikitext: string): string {
  return wikitext
    .replace(/\{\{([^{}|=\n]+)(?:\|([^{}|=\n]*))?(?:\|[^{}=\n]*)?\}\}/g, (_, name: string, first?: string) =>
      (first?.trim() || name.trim()),
    )
    .replace(/\[\[(?:Fichier|File|Image):[^\]]*\]\]/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/'''?/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
}

/** A heading line's level (the number of leading `=`), or 0 for any other line. */
const headingLevel = (line: string) => (/^(=+)[^=].*=+\s*$/.exec(line)?.[1] ?? "").length;

function section(wikitext: string, heading: string): string | undefined {
  const lines = wikitext.split("\n");
  const want = fold(heading);
  const start = lines.findIndex((l) => headingLevel(l) > 0 && fold(l.replace(/=/g, "").trim()).includes(want));
  if (start < 0) return undefined;
  const level = headingLevel(lines[start] ?? "");
  let end = start + 1;
  while (end < lines.length && !(headingLevel(lines[end] ?? "") > 0 && headingLevel(lines[end] ?? "") <= level)) end++;
  return lines.slice(start, end).join("\n");
}

async function page(title: string, opts: { raw: boolean; section?: string }): Promise<void> {
  const body = await api({ action: "parse", page: title, prop: "wikitext|sections", redirects: "1" });
  const p = body.parse;
  let text: string = p.wikitext;
  console.log(`# ${p.title}  (${PAGE_URL}${encodeURIComponent(p.title.replace(/ /g, "_"))})`);
  if (opts.section) {
    const s = section(text, opts.section);
    if (s === undefined) {
      const names = (p.sections as Json[]).map((s) => s.line).join(", ");
      throw new Error(`No section matching "${opts.section}". Sections: ${names}`);
    }
    text = s;
  }
  console.log(opts.raw ? text : flatten(text));
}

export {};

const USAGE = `Usage:
  npm run wiki -- search <words>                      titles containing <words>, then full-text hits
  npm run wiki -- page <title> [--section <heading>] [--raw]`;

const [command, ...rest] = process.argv.slice(2);
const raw = rest.includes("--raw");
const sectionAt = rest.indexOf("--section");
const sectionName = sectionAt >= 0 ? rest[sectionAt + 1] : undefined;
const positional = rest
  .filter((a, i) => a !== "--raw" && (sectionAt < 0 || (i !== sectionAt && i !== sectionAt + 1)))
  .join(" ");

try {
  if (command === "search" && positional) await search(positional);
  else if (command === "page" && positional) await page(positional, { raw, section: sectionName });
  else {
    console.error(USAGE);
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
