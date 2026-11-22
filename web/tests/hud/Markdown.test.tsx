import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../../src/hud/Markdown.tsx";

const html = (text: string, onToggle?: (line: number) => void) => renderToStaticMarkup(<Markdown text={text} onToggle={onToggle} />);

describe("Markdown", () => {
  it("renders bold, strikethrough, headers, and lists", () => {
    const out = html("# Plan\n**go** ~~wait~~ now\n\n- a\n- b");
    expect(out).toContain("<h1>Plan</h1>");
    expect(out).toContain("<strong>go</strong>");
    expect(out).toContain("<del>wait</del>");
    expect(out).toContain("<li>a</li>");
  });

  it("drops links, images, tables, footnotes, and raw HTML but keeps their text", () => {
    const out = html("[click](https://x.test) ![pic](https://x.test/a.png) <script>alert(1)</script> https://x.test [^1]\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[^1]: note");
    expect(out).not.toMatch(/<(a|img|script|table|section)\b/);
    expect(out).toContain("click");
    expect(out).toContain("| a | b |");
  });

  it("shows checkboxes read-only unless a toggle handler is given", () => {
    const text = "- [ ] a\n- [x] b";
    expect(html(text)).toMatch(/<input[^>]*disabled/);
    const live = html(text, () => {});
    expect(live).not.toMatch(/disabled/);
    expect(live.match(/checked/g)).toHaveLength(1);
  });
});
