// One row of an iTrackie feed:
// - Chat messages (with a sender name): the sender's crew sprite on the left,
//   the name and recency caption on top, and the body below.
// - Ship and room log messages (no sender): marker (info/warning icon, or visibility
//   badge for secret/covert actions) with the recency caption beside it on the left,
//   and the body beside it.

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
  className,
  seq,
  children,
}: {
  marker: ReactNode;
  name?: ReactNode;
  at: number | undefined;
  /** Small buttons at the right of the name row (entries with a name only). */
  tools?: ReactNode;
  className?: string | undefined;
  /**
   * A chat message's `seq`: the row becomes focusable (not a tab stop) and its feed marks it read on focus or click
   * (`useReadMarking` in Thread.tsx, #400).
   */
  seq?: number | undefined;
  children: ReactNode;
}) {
  return (
    <li
      className={["entry", name === undefined && "entry-inline", className].filter(Boolean).join(" ")}
      data-seq={seq}
      tabIndex={seq === undefined ? undefined : -1}
    >
      <div className="entry-marker">
        {marker}
        {name === undefined && <RecencyStamp at={at} />}
      </div>
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
