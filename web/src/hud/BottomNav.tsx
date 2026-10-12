// Phone layout only: switches which of the three panels is on screen.
// Plain buttons rather than Base UI Tabs, because on desktop all three panels
// are visible at once and Tabs.Panel would hide them.

export type MobilePanel = "inspect" | "room" | "itrackie";

const BUTTONS: { panel: MobilePanel; label: string }[] = [
  { panel: "inspect", label: "Inspect" },
  { panel: "room", label: "Room" },
  { panel: "itrackie", label: "iTrackie" },
];

export function BottomNav({ panel, onChange }: { panel: MobilePanel; onChange: (panel: MobilePanel) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Panels">
      {BUTTONS.map((b) => (
        <button
          key={b.panel}
          className="bottom-nav-button"
          aria-current={b.panel === panel ? "page" : undefined}
          onClick={() => onChange(b.panel)}
        >
          {b.label}
        </button>
      ))}
    </nav>
  );
}
