// What the replay page shows while a replay loads or when it can't be shown (#369), and the badge on a frame recorded
// by another build. The page (#370) places them; they read only `useReplay`'s status.

import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { GameCard } from "../games/GamesPage.tsx";
import type { Replay } from "./useReplay.ts";
import "./replay.css";

/** The notice for `replay.status`, or nothing once it is ready (apart from a pending `429` retry). */
export function ReplayNotice({ replay }: { replay: Pick<Replay, "status" | "rateLimited" | "summary" | "retry"> }) {
  const { t } = useTranslation();
  const { status, rateLimited, summary, retry } = replay;
  if (rateLimited)
    return (
      <p className="replay-notice loading" role="status">
        {t("replay.rateLimited")}
      </p>
    );
  switch (status) {
    case "ready":
      return null;
    case "loading":
    case "preparing":
      return (
        <p className="replay-notice loading" role="status">
          {t(status === "loading" ? "replay.loading" : "replay.preparing")}
        </p>
      );
    case "notReady":
    case "failed":
      return (
        <p className="replay-notice" role="alert">
          {t(status === "notReady" ? "replay.notReady" : "replay.failed")}{" "}
          <button type="button" onClick={retry}>
            {t("replay.retry")}
          </button>
        </p>
      );
    case "notFound":
      return (
        <p className="replay-notice" role="alert">
          {t("replay.notFound")}
        </p>
      );
    case "tooOld":
      return (
        <div className="replay-too-old">
          <p className="replay-notice" role="alert">
            {t("replay.tooOld")}
          </p>
          {summary && (
            <ol className="games-list">
              <GameCard game={summary} />
            </ol>
          )}
        </div>
      );
  }
}

/** "Recorded on an older version": the frame on screen was recorded by another build, so it may be shown wrong. */
export function OlderBuildBadge() {
  const { t } = useTranslation();
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="replay-older-build">
        {t("replay.olderBuild")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip">{t("replay.olderBuildHint")}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
