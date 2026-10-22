// The editor's palette: every slice in the art, searchable by name, with its first frame. Picking one
// arms placing: each tap or click on the ship then puts a tile of it there (ShipEditor).

import { useMemo, useState } from "react";
import type { ShipLayout } from "@mush2/shared";
import { frameRect } from "../iso/placement.ts";
import { atlasUrl } from "../iso/shipLayout.ts";

/** The biggest a thumbnail is drawn, in pixels a side (never scaled up). */
const THUMB = 56;

export function SliceThumb({ layout, slice }: { layout: ShipLayout; slice: string }) {
  const s = layout.slices[slice];
  const url = s && atlasUrl(layout, s.sheet);
  if (!s || !url) return <span className="thumb" />;
  const scale = Math.min(1, THUMB / Math.max(s.width, s.height));
  const { sx, sy } = frameRect(s, 0);
  return (
    <span className="thumb" style={{ width: Math.ceil(s.width * scale), height: Math.ceil(s.height * scale) }}>
      <span
        style={{
          width: s.width,
          height: s.height,
          backgroundImage: `url(${url})`,
          backgroundPosition: `-${sx}px -${sy}px`,
          transform: `scale(${scale})${s.flipX ? " scaleX(-1)" : ""}`,
        }}
      />
    </span>
  );
}

export function Palette({ layout, armed, onArm }: { layout: ShipLayout; armed: string | null; onArm: (slice: string | null) => void }) {
  const [search, setSearch] = useState("");
  const used = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of layout.rooms) for (const t of r.tiles) n.set(t.slice, (n.get(t.slice) ?? 0) + 1);
    return n;
  }, [layout]);
  const names = Object.keys(layout.slices)
    .filter((id) => id.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  return (
    <section className="editor-palette">
      <h2>Place a tile</h2>
      <input type="search" placeholder="Search slices" aria-label="Search slices" value={search} onChange={(e) => setSearch(e.target.value)} />
      {armed && (
        <p className="armed">
          Placing <b>{armed}</b>: click or tap a cell.{" "}
          <button type="button" onClick={() => onArm(null)}>
            Stop
          </button>
        </p>
      )}
      <ul>
        {names.map((id) => (
          <li key={id}>
            <button type="button" className={id === armed ? "on" : undefined} aria-pressed={id === armed} onClick={() => onArm(id === armed ? null : id)}>
              <SliceThumb layout={layout} slice={id} />
              <span className="name">{id}</span>
              <span className="muted">{used.get(id) ?? 0} on the map</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
