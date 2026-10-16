// Chat message body: GitHub-flavoured markdown, limited to text formatting.
// react-markdown builds React elements (never innerHTML) and ignores raw HTML.
// Links, images, and tables are left out on purpose: moderation strips links,
// and a remote image would let a message ping a server. Disallowed elements
// are unwrapped, so their text still shows.

import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const ALLOWED = [
  "p", "strong", "em", "del", "br", "code", "pre", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "input", "hr",
];

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
      <ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={ALLOWED} unwrapDisallowed components={components}>
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
