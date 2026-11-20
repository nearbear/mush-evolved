// The kit's game-screen frame: the game's own layout (top bar, Inspect | room | iTrackie, and on phones one panel at a
// time with the real bottom nav), with skeleton blocks wherever a page doesn't pass the real component. Pages for
// components that fill a whole panel (Inspect, the patrol cockpit, the expedition screen, the iTrackie) show them in
// it, so each is seen against the rest of the screen. Dev-only.

import { useState, type ReactNode } from "react";
import { BottomNav, type MobilePanel } from "../hud/BottomNav.tsx";
import { humanView } from "./samples.ts";

/** A grey placeholder for a part of the screen a page doesn't show: its name and a few bars. */
function Bones({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="m2k-skel" aria-hidden="true">
      <span className="m2k-skel-label">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="m2k-bone" />
      ))}
    </div>
  );
}

/**
 * One game screen. `room` fills the room view (`.room-view`), as GameView's world column does; the other slots take the
 * real component. `panel` is the one a phone shows first; the bottom nav switches it, as in the game.
 */
export function GameFrame({ panel, topBar, inspect, room, itrackie }: { panel: MobilePanel; topBar?: ReactNode; inspect?: ReactNode; room?: ReactNode; itrackie?: ReactNode }) {
  const [shown, setShown] = useState(panel);
  return (
    <div className="m2k-screen">
      {topBar ?? (
        <div className="top-bar m2k-skel-bar">
          <Bones label="Top bar" rows={0} />
        </div>
      )}
      <div className="three-panel" data-panel={shown}>
        <div className="left-column">
          {inspect ?? (
            <aside className="panel inspect">
              <Bones label="Inspect" rows={6} />
            </aside>
          )}
        </div>
        <div className="world">
          <div className="room-view">
            {room ?? (
              <section className="iso-room">
                <Bones label="Room" rows={0} />
              </section>
            )}
          </div>
        </div>
        {itrackie ?? (
          <aside className="itrackie m2k-skel-itrackie">
            <Bones label="iTrackie" rows={10} />
          </aside>
        )}
      </div>
      <BottomNav panel={shown} onChange={setShown} view={humanView} />
    </div>
  );
}

/** A skeleton room scene, for pages that put real HUD pieces over the room but can't draw the scene itself. */
export function SkeletonRoom() {
  return (
    <section className="iso-room">
      <Bones label="Room scene" rows={0} />
    </section>
  );
}
