// Dev-only design kit for mush2's own components (/design-kit-mush2), next to the Mush art kit (design-kit.html).
// One page per component (/design-kit-mush2/<id>), each rendering a real component from web/src with sample props, so
// it can be checked in isolation. A side nav lists the pages; on phones it is a drawer behind the menu button.
// Sample text is English only: this page never ships.

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useState, type ComponentType } from "react";
import { Link, NavLink, Route, Routes, useLocation, useParams } from "react-router";
import { IconButton } from "../hud/IconButton.tsx";
import { SelfHudSection, ShipCardSection, TerminalFrameSection } from "./CoreSections.tsx";
import { EndingsSection, ExpeditionSection, ITrackieSection, PatrolSection, SignalSection, SignalsTabSection, TerminalBodiesSection } from "./GameSections.tsx";
import { GameScreenSection } from "./GameScreenSection.tsx";
import { InspectSection, InventorySection, ItemAttrIconsSection, PeekBarSection, RoomCornerSection, ShipOverlaySection, StatusIconsSection, TopBarSection } from "./HudSections.tsx";
import { AccountSection, CharacterPickerSection } from "./LobbySections.tsx";
import { PrimitivesSection } from "./PrimitivesSection.tsx";
import "./mush2Kit.css";

const BASE = "/design-kit-mush2";

/**
 * A kit page. `game` pages render inside `main.game`, as the game screen does, so the game screen's card look
 * (card.css) applies; the others (terminals, which the game opens in a portal, and lobby pieces) do not.
 */
type Page = { id: string; label: string; Section: ComponentType; game?: boolean };

/** The side nav's groups, in nav order. */
const GROUPS: [heading: string, pages: Page[]][] = [
  [
    "Foundations",
    [
      { id: "game-screen", label: "Game screen", Section: GameScreenSection, game: true },
      { id: "primitives", label: "Primitives", Section: PrimitivesSection },
    ],
  ],
  [
    "Full panels",
    [
      { id: "inspect", label: "Inspect", Section: InspectSection, game: true },
      { id: "patrol", label: "Patrol", Section: PatrolSection, game: true },
      { id: "expedition", label: "Expedition", Section: ExpeditionSection, game: true },
      { id: "itrackie", label: "iTrackie", Section: ITrackieSection, game: true },
      { id: "endings", label: "Death and end", Section: EndingsSection, game: true },
    ],
  ],
  [
    "Game HUD",
    [
      { id: "top-bar", label: "Top bar", Section: TopBarSection, game: true },
      { id: "self-hud", label: "Self HUD", Section: SelfHudSection, game: true },
      { id: "ship-overlay", label: "Ship card (phone)", Section: ShipOverlaySection, game: true },
      { id: "inventory", label: "Inventory", Section: InventorySection, game: true },
      { id: "room-corners", label: "Queue and tips", Section: RoomCornerSection, game: true },
      { id: "peek-bar", label: "Peek bar", Section: PeekBarSection, game: true },
      { id: "status-icons", label: "Status icons", Section: StatusIconsSection, game: true },
      { id: "item-attr-icons", label: "Item icons", Section: ItemAttrIconsSection, game: true },
    ],
  ],
  [
    "Terminals",
    [
      { id: "terminal", label: "Terminal frame", Section: TerminalFrameSection },
      { id: "terminal-bodies", label: "Terminals", Section: TerminalBodiesSection },
      { id: "sol-signal", label: "Sol signal", Section: SignalSection },
      { id: "signals-tab", label: "Signals", Section: SignalsTabSection },
    ],
  ],
  [
    "Outside the game",
    [
      { id: "ship-card", label: "Ship card", Section: ShipCardSection },
      { id: "character-picker", label: "Character picker", Section: CharacterPickerSection },
      { id: "account", label: "Account", Section: AccountSection },
    ],
  ],
];

const PAGES = new Map(GROUPS.flatMap(([, pages]) => pages.map((page) => [page.id, page] as const)));

function KitNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="m2k-nav" aria-label="Kit pages">
      {GROUPS.map(([heading, pages]) => (
        <div key={heading} className="m2k-nav-group">
          <h2>{heading}</h2>
          <ul>
            {pages.map(({ id, label }) => (
              <li key={id}>
                <NavLink to={`${BASE}/${id}`} onClick={onNavigate}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="m2k-nav-group">
        <h2>Elsewhere</h2>
        <ul>
          <li>
            <a href="/design-kit.html">Mush art kit</a>
          </li>
        </ul>
      </div>
    </nav>
  );
}

/** The landing page: every page, by group. */
function Overview() {
  return (
    <section>
      <h2>Design kit</h2>
      <p>
        Our own components with sample props, one page each, so every look can be checked in isolation at desktop and at
        the 360px phone width without playing to the state that shows it. Components that fill a whole panel sit in a
        skeleton of the game screen. See <code>docs/plans/design-kit.md</code>.
      </p>
      <div className="m2k-overview">
        {GROUPS.map(([heading, pages]) => (
          <div key={heading}>
            <h3>{heading}</h3>
            <ul>
              {pages.map(({ id, label }) => (
                <li key={id}>
                  <Link to={`${BASE}/${id}`}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function KitPage() {
  const page = PAGES.get(useParams().page ?? "");
  if (!page) {
    return (
      <main className="m2k-content">
        <p>
          No such page. <Link to={BASE}>All pages</Link>
        </p>
      </main>
    );
  }
  const { Section, game } = page;
  return (
    <main className={game ? "game m2k-content" : "m2k-content"}>
      <Section />
    </main>
  );
}

export default function Mush2Kit() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname, hash } = useLocation();
  const current = PAGES.get(pathname.slice(BASE.length + 1));

  // A new page starts at its top (a #hash link keeps the browser's jump). Runs on every path change.
  useEffect(() => {
    if (pathname.startsWith(BASE) && !hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <div className="m2k">
      <header className="m2k-header">
        <span className="m2k-menu">
          <IconButton icon="☰" label="Kit pages" onClick={() => setMenuOpen(true)} />
        </span>
        <h1>
          <Link to={BASE}>Design kit</Link>
        </h1>
        {current && <span className="m2k-current">{current.label}</span>}
      </header>
      <div className="m2k-body">
        <aside className="m2k-side">
          <KitNav />
        </aside>
        <Routes>
          <Route
            index
            element={
              <main className="m2k-content">
                <Overview />
              </main>
            }
          />
          <Route path=":page" element={<KitPage />} />
        </Routes>
      </div>
      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="m2k-drawer-backdrop" />
          <Dialog.Popup className="m2k-drawer">
            <div className="m2k-drawer-head">
              <Dialog.Title className="m2k-drawer-title">Design kit</Dialog.Title>
              <IconButton icon="✕" label="Close" onClick={() => setMenuOpen(false)} />
            </div>
            <KitNav onNavigate={() => setMenuOpen(false)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
