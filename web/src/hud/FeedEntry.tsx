// One row of an iTrackie feed: a marker on the left (the info icon for ship
// messages, the sender's crew sprite for chat), the sender's name with the
// recency caption at the right on top, and the body below it. Entries with no
// sender (ship messages) have no top row: the caption sits beside the body.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CharacterId } from "@mush2/shared";
import { INFO_ICON, spriteStrip } from "../art/assets.ts";
import { useKeyedSprite } from "../art/keyedSprite.ts";
import { RecencyStamp } from "./RecencyStamp.tsx";

export function FeedEntry({
  marker,
  name,
  at,
  className,
  children,
}: {
  marker: ReactNode;
  name?: ReactNode;
  at: number | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <li className={["entry", name === undefined && "entry-inline", className].filter(Boolean).join(" ")}>
      <div className="entry-marker">{marker}</div>
      {name !== undefined && (
        <div className="entry-head">
          <span>{name}</span>
          <RecencyStamp at={at} />
        </div>
      )}
      <div className="entry-body">{children}</div>
      {/* No sender to put on top: the caption shares the body's row. */}
      {name === undefined && <RecencyStamp at={at} />}
    </li>
  );
}

export function InfoMarker() {
  const { t } = useTranslation();
  return <img className="entry-info" src={INFO_ICON} alt={t("itrackie.shipMessage")} />;
}

/** The sender as they look in the isometric view (first frame of the walk strip). */
export function CrewAvatar({ character }: { character: CharacterId | undefined }) {
  const url = useKeyedSprite(spriteStrip(character, "face"));
  return <div className="entry-avatar" style={{ backgroundImage: url ? `url(${url})` : undefined }} aria-hidden="true" />;
}
