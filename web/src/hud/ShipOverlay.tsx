// Phones only: a button in the room view's lower-left corner that opens the ship card (resources and titles),
// which sits in the top bar on desktop. Closes on the button, Escape, or a press elsewhere in the room view.

import { useCallback, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerView } from "@mush2/shared";
import { SHIP_RESOURCE_ICONS } from "../art/assets.ts";
import { Hint } from "./IconButton.tsx";
import { ShipResources } from "./ShipResources.tsx";
import { useOverlayDismiss } from "./useOverlayDismiss.ts";

export function ShipOverlay({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useOverlayDismiss(open, close, rootRef);
  const label = t("shipResources.button");

  return (
    <div className="ship-overlay" ref={rootRef}>
      {open && (
        <section id={panelId} role="dialog" tabIndex={-1} className="ship-popup" aria-label={label}>
          <ShipResources ship={view.ship} hunters={view.hunters.count} titles={view.titles} />
        </section>
      )}
      <Hint label={label}>
        <button
          type="button"
          className="inventory-toggle"
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <img src={SHIP_RESOURCE_ICONS.hull} alt="" />
        </button>
      </Hint>
    </div>
  );
}
