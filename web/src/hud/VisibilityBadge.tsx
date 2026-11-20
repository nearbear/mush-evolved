// The badge on a room log line that wasn't public (#366): the action buttons' icon for its kind (a padlock, a hand
// hushing, a camera). Hovering, focusing or tapping it says what the kind means and, for a secret or covert line,
// whether it leaked (reached anyone besides the actor). A popover rather than a tooltip, so touch can open it too.
// The replay viewer (#371) shows the same badge.

import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import type { LogKind } from "@mush2/shared";
import { VISIBILITY_ICONS } from "../art/assets.ts";

/** The popover's text: what the kind means and, for secret and covert, whether the line leaked. */
const MEANING = {
  private: { kept: "itrackie.visibility.private", leaked: "itrackie.visibility.private" },
  secret: { kept: "itrackie.visibility.secret", leaked: "itrackie.visibility.secretLeaked" },
  covert: { kept: "itrackie.visibility.covert", leaked: "itrackie.visibility.covertLeaked" },
} as const satisfies Record<LogKind, { kept: string; leaked: string }>;

/** `text` replaces the popover's line-log meaning, for a badge on something other than a log line. */
export function VisibilityBadge({ kind, leaked, text }: { kind: LogKind; leaked: boolean; text?: string }) {
  const { t } = useTranslation();
  const label = t(`actions.visibility.${kind}`);
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="visibility-badge" aria-label={label}>
        <img src={VISIBILITY_ICONS[kind]} alt="" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip">{text ?? t(MEANING[kind][leaked ? "leaked" : "kept"])}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
