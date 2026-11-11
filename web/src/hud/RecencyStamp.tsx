// The small "47m" caption on iTrackie log lines and chat messages.
// Hovering, focusing or tapping it shows the exact time in the player's own
// time zone (a popover rather than a tooltip, so touch can open it too).

import { Popover } from "@base-ui/react/popover";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { recency } from "./recency.ts";

const REFRESH_MS = 30_000;

/** The current time, refreshed so every caption on screen ages together. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Renders nothing for an entry without a time (a game from before timestamps). */
export function RecencyStamp({ at }: { at: number | undefined }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  if (at === undefined) return null;
  const { key, ...params } = recency(at, now);
  const exact = new Date(at).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "medium" });
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="recency">
        {t(`itrackie.ago.${key}`, params)}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip">{exact}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
