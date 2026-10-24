// The editor's menus and popovers, thin wrappers over Base UI's Menu and Popover so ShipEditor reads as a
// list of commands: a menu (in the menu bar or the scene toolbar), its items with their keys, checkbox and
// radio items, and a popover panel for anything that isn't a list of commands (checks, keys, save errors).

import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";

export function EditorMenu({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger className={`editor-menu-trigger${className ? ` ${className}` : ""}`}>{label}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="editor-menu-positioner" sideOffset={2} align="start">
          <Menu.Popup className="editor-menu">{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function Item({ onClick, disabled, keys, children }: { onClick: () => void; disabled?: boolean; keys?: string; children: ReactNode }) {
  return (
    <Menu.Item className="editor-menu-item" onClick={onClick} disabled={disabled}>
      <span className="mark" />
      <span>{children}</span>
      {keys && <kbd>{keys}</kbd>}
    </Menu.Item>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return (
    <Menu.CheckboxItem className="editor-menu-item" checked={checked} onCheckedChange={onChange}>
      <span className="mark">
        <Menu.CheckboxItemIndicator>✓</Menu.CheckboxItemIndicator>
      </span>
      <span>{children}</span>
    </Menu.CheckboxItem>
  );
}

export function Radios<T>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; disabled?: boolean }[] }) {
  return (
    <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
      {options.map((o) => (
        <Menu.RadioItem key={String(o.value)} className="editor-menu-item" value={o.value} disabled={o.disabled} closeOnClick>
          <span className="mark">
            <Menu.RadioItemIndicator>•</Menu.RadioItemIndicator>
          </span>
          <span>{o.label}</span>
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}

export function Sub({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger className="editor-menu-item">
        <span className="mark" />
        <span>{label}</span>
        <span className="more">▸</span>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner className="editor-menu-positioner" alignOffset={-4}>
          <Menu.Popup className="editor-menu scroll">{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <div className="editor-menu-heading">{children}</div>;
}

export const Separator = () => <Menu.Separator className="editor-menu-separator" />;

export function PopoverPanel({
  label,
  trigger,
  className,
  align = "start",
  children,
}: {
  label: string;
  trigger: ReactNode;
  className?: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger className={`editor-menu-trigger${className ? ` ${className}` : ""}`} aria-label={label}>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="editor-menu-positioner" sideOffset={2} align={align}>
          <Popover.Popup className="editor-popover">{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
