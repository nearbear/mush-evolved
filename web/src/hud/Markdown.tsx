// Chat message body: CommonMark plus GFM strikethrough and task lists, limited
// to text formatting. react-markdown builds React elements (never innerHTML)
// and ignores raw HTML. Links, images, tables, footnotes, and autolinks are
// left out on purpose: moderation strips links, and a remote image would let a
// message ping a server. Disallowed elements are unwrapped, so their text still
// shows.

import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmTaskListItemFromMarkdown } from "mdast-util-gfm-task-list-item";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown, { type Components } from "react-markdown";

const ALLOWED = [
  "p", "strong", "em", "del", "br", "code", "pre", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "input", "hr",
];

function remarkChatGfm(this: { data(): object }) {
  const data = this.data() as { micromarkExtensions?: unknown[]; fromMarkdownExtensions?: unknown[] };
  (data.micromarkExtensions ??= []).push(gfmStrikethrough(), gfmTaskListItem());
  (data.fromMarkdownExtensions ??= []).push(gfmStrikethroughFromMarkdown(), gfmTaskListItemFromMarkdown());
}

const REMARK_PLUGINS = [remarkChatGfm];

/** Source line (0-based) of the list item being rendered. The checkbox element itself carries no position. */
const ItemLine = createContext(-1);

/** `onToggle(line)` makes checkboxes clickable (0-based source line of the item); without it they are read-only. */
export function Markdown({ text, onToggle }: { text: string; onToggle?: (line: number) => void }) {
  const components: Components = {
    li: ({ node, children, className }) => (
      <li className={className}>
        <ItemLine.Provider value={node?.position ? node.position.start.line - 1 : -1}>{children}</ItemLine.Provider>
      </li>
    ),
    input: ({ checked, type }) => (type === "checkbox" ? <Box checked={!!checked} onToggle={onToggle} /> : null),
  };
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} allowedElements={ALLOWED} unwrapDisallowed components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function Box({ checked, onToggle }: { checked: boolean; onToggle?: (line: number) => void }) {
  const { t } = useTranslation();
  const line = useContext(ItemLine);
  return <input type="checkbox" checked={checked} disabled={!onToggle || line < 0} onChange={() => onToggle?.(line)} aria-label={t("itrackie.checkbox")} />;
}
