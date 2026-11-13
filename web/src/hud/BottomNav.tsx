// Phone layout only: switches which of the three panels is on screen.
// Plain buttons rather than Base UI Tabs, because on desktop all three panels
// are visible at once and Tabs.Panel would hide them.

import type { PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { TAB_ICONS } from "../art/assets.ts";
import { useReadSnapshot } from "../chatRead.ts";
import { totalUnread } from "./chatTabs.ts";

export type MobilePanel = "inspect" | "room" | "itrackie";

const BUTTONS = [
  { panel: "inspect", label: "nav.inspect", icon: TAB_ICONS.inspect },
  { panel: "room", label: "nav.room", icon: TAB_ICONS.room },
  { panel: "itrackie", label: "nav.itrackie", icon: TAB_ICONS.itrackie },
] as const satisfies readonly { panel: MobilePanel; label: string; icon?: string }[];

export function BottomNav({
  panel,
  onChange,
  view,
}: {
  panel: MobilePanel;
  onChange: (panel: MobilePanel) => void;
  view: Pick<PlayerView, "readChannels" | "chatCounts">;
}) {
  const { t } = useTranslation();
  const read = useReadSnapshot();
  const unread = read ? totalUnread(view, read) : 0;
  return (
    <nav className="bottom-nav" aria-label={t("nav.panels")}>
      {BUTTONS.map((b) => {
        const badge = b.panel === "itrackie" ? unread : 0;
        const name = t(b.label);
        return (
          <button
            type="button"
            key={b.panel}
            className="bottom-nav-button"
            aria-current={b.panel === panel ? "page" : undefined}
            aria-label={badge > 0 ? t("itrackie.unreadTab", { name, count: badge }) : undefined}
            onClick={() => onChange(b.panel)}
          >
            <img className="tab-icon" src={b.icon} alt="" /> {name}
            {badge > 0 && (
              <span className="tab-badge" aria-hidden="true">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
