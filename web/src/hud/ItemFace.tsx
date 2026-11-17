import type { ReactNode } from "react";

/**
 * An item's square face: the icon filling it, with an optional short label along the bottom (only skill
 * books and blueprints have one; the full name is the caller's tooltip) and an optional count in the bottom right corner
 * (a merchant's deal: "×9"; the caller names it for a screen reader). Everything is sized in em off `--tile` (default
 * 76px), so a caller resizes the whole face by setting that one variable.
 */
export function ItemFace({ label, count, children }: { label?: string | undefined; count?: number | undefined; children: ReactNode }) {
  return (
    <span className="item-face">
      {children}
      {label !== undefined && <span className="item-label">{label}</span>}
      {count !== undefined && (
        <span className="item-count" aria-hidden="true">
          {count}
        </span>
      )}
    </span>
  );
}
