// An emoji button (and tab) whose text label shows in a tooltip (hover or keyboard focus)
// and is the accessible name. Emoji are placeholders until there is icon art.
// Uses the global Mush `button` style; only layout is set here.

import { Tabs } from "@base-ui/react/tabs";
import { Tooltip } from "@base-ui/react/tooltip";

export function IconButton({
  icon,
  src,
  label,
  onClick,
  disabled,
  type = "button",
}: {
  icon?: string;
  src?: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <Tooltip.Provider delay={300}>
      <Tooltip.Root>
        <Tooltip.Trigger
          className="icon-button"
          type={type}
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          render={<button type={type} />}
        >
          {src ? <img className="tab-icon" src={src} alt="" /> : <span aria-hidden="true">{icon}</span>}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6}>
            <Tooltip.Popup className="tooltip">{label}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/** A tab for a Base UI `Tabs.List` with the same tooltip and accessible name: pixel-art `src`, or an emoji `icon` placeholder. */
export function IconTab({ value, icon, src, label, className }: { value: string; icon?: string; src?: string; label: string; className?: string }) {
  return (
    <Tooltip.Provider delay={300}>
      <Tooltip.Root>
        <Tooltip.Trigger className={className ? `itrackie-tab kit-minitab ${className}` : "itrackie-tab kit-minitab"} aria-label={label} render={<Tabs.Tab value={value} />}>
          {src ? <img className="tab-icon" src={src} alt="" /> : <span aria-hidden="true">{icon}</span>}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6}>
            <Tooltip.Popup className="tooltip">{label}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/** Wraps one existing element (a button, a dialog trigger) in a tooltip. The element keeps its own accessible name. */
export function Hint({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip.Provider delay={300}>
      <Tooltip.Root>
        <Tooltip.Trigger render={children} />
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6}>
            <Tooltip.Popup className="tooltip">{label}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
