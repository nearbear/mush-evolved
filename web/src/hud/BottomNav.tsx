// Phone layout only: switches which of the three panels is on screen.
// Plain buttons rather than Base UI Tabs, because on desktop all three panels
// are visible at once and Tabs.Panel would hide them.

import { useTranslation } from "react-i18next";

export type MobilePanel = "inspect" | "room" | "itrackie";

const BUTTONS = [
  { panel: "inspect", label: "nav.inspect" },
  { panel: "room", label: "nav.room" },
  { panel: "itrackie", label: "nav.itrackie" },
] as const satisfies readonly { panel: MobilePanel; label: string }[];

export function BottomNav({ panel, onChange }: { panel: MobilePanel; onChange: (panel: MobilePanel) => void }) {
  const { t } = useTranslation();
  return (
    <nav className="bottom-nav" aria-label={t("nav.panels")}>
      {BUTTONS.map((b) => (
        <button
          key={b.panel}
          className="bottom-nav-button"
          aria-current={b.panel === panel ? "page" : undefined}
          onClick={() => onChange(b.panel)}
        >
          {t(b.label)}
        </button>
      ))}
    </nav>
  );
}
