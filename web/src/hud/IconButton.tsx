// An emoji button (and tab) whose text label shows in a tooltip (hover or keyboard focus)
// and is the accessible name. Emoji are placeholders until there is icon art.
// Uses the global Mush `button` style; only layout is set here.

import { Tabs } from "@base-ui/react/tabs";
import { Tooltip } from "@base-ui/react/tooltip";

export function IconButton({
  icon,
  label,
  onClick,
  disabled,
  type = "button",
}: {
  icon: string;
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
          <span aria-hidden="true">{icon}</span>
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

/** An emoji tab for a Base UI `Tabs.List`, with the same tooltip and accessible name. */
export function IconTab({ value, icon, label }: { value: string; icon: string; label: string }) {
  return (
    <Tooltip.Provider delay={300}>
      <Tooltip.Root>
        <Tooltip.Trigger className="itrackie-tab" aria-label={label} render={<Tabs.Tab value={value} />}>
          <span aria-hidden="true">{icon}</span>
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
