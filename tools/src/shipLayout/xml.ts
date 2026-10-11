// Minimal XML reader for tiles.xml: elements, attributes, and text. No
// namespaces, CDATA, or entities beyond the basic five, which this file
// doesn't need. Comments and the <?xml?> declaration are skipped.

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Concatenated, trimmed text content directly inside this element. */
  text: string;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e: string) => ENTITIES[e]!);

export function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  // Comments are non-greedy: tiles.xml has oddities like `<!-- nexus -></!-->`.
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;

  let expected = 0;
  for (const m of source.matchAll(token)) {
    // matchAll silently skips text no alternative matches; treat that as an error.
    if (m.index !== expected) throw new Error(`Unparsed XML near: ${source.slice(expected, expected + 40)}`);
    expected = m.index + m[0].length;
    const [, closeName, openName, attrText, selfClose, text] = m;
    const top = stack[stack.length - 1]!;
    if (openName) {
      const el: XmlElement = { name: openName, attrs: {}, children: [], text: "" };
      for (const a of attrText!.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) el.attrs[a[1]!] = decode(a[2]!);
      top.children.push(el);
      if (!selfClose) stack.push(el);
    } else if (closeName) {
      if (top.name !== closeName) throw new Error(`Mismatched </${closeName}>, expected </${top.name}>`);
      stack.pop();
    } else if (text?.trim()) {
      top.text = (top.text + " " + decode(text.trim())).trim();
    }
  }
  if (expected !== source.length) throw new Error(`Unparsed XML near: ${source.slice(expected, expected + 40)}`);
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1]!.name}>`);
  return root;
}

export const child = (el: XmlElement, name: string) => el.children.find((c) => c.name === name);
export const childrenNamed = (el: XmlElement, name: string) => el.children.filter((c) => c.name === name);
