// One row of an iTrackie feed: a marker on the left (the info icon for ship
// messages, the sender's crew sprite for chat), the sender's name with the
// recency caption right after it on top, and the body below it. Entries with no
// sender (ship messages) have no top row: the caption sits beside the body.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CharacterId } from "@mush2/shared";
import { INFO_ICON, WARNING_ICON, spriteStrip } from "../art/assets.ts";
import { useKeyedSprite } from "../art/keyedSprite.ts";
import { RecencyStamp } from "./RecencyStamp.tsx";

export function FeedEntry({
  marker,
  name,
  at,
  tools,
  badge,
  className,
  children,
}: {
  marker: ReactNode;
  name?: ReactNode;
  at: number | undefined;
  /** Small buttons at the right of the name row (entries with a name only). */
  tools?: ReactNode;
  /** A small badge beside the recency caption (entries without a name only): a log line's visibility. */
  badge?: ReactNode;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <li className={["entry", name === undefined && "entry-inline", className].filter(Boolean).join(" ")}>
      <div className="entry-marker">{marker}</div>
      {name !== undefined && (
        <div className="entry-head">
          <span className="entry-name">
            {name}
            <RecencyStamp at={at} />
          </span>
          {tools}
        </div>
      )}
      <div className="entry-body">{children}</div>
      {/* No sender to put on top: the caption shares the body's row. */}
      {name === undefined && (
        <span className="entry-stamp">
          {badge}
          <RecencyStamp at={at} />
        </span>
      )}
    </li>
  );
}

export function InfoMarker() {
  const { t } = useTranslation();
  return <img className="entry-info info" src={INFO_ICON} alt={t("itrackie.shipMessage")} />;
}

export function WarningMarker() {
  const { t } = useTranslation();
  return <img className="entry-info" src={WARNING_ICON} alt={t("itrackie.warning")} />;
}

/** The sender as they look in the isometric view (first frame of the walk strip). */
export function CrewAvatar({ character }: { character: CharacterId | undefined }) {
  const url = useKeyedSprite(spriteStrip(character, "face"));
  return <div className="entry-avatar" style={{ backgroundImage: url ? `url(${url})` : undefined }} aria-hidden="true" />;
}
