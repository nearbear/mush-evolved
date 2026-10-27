// Sticky title bar for a scrolling dialog popup: title on the left, close "×" in the upper right.
// Put it first inside a `settings-popup`; the popup's top padding is dropped automatically.

import { Dialog } from "@base-ui/react/dialog";

export function DialogHeader({ heading, closeLabel, className }: { heading: string; closeLabel: string; className?: string }) {
  return (
    <header className={className ? `dialog-header ${className}` : "dialog-header"}>
      <Dialog.Title className="settings-title">{heading}</Dialog.Title>
      <Dialog.Close className="dialog-header-close" aria-label={closeLabel}>
        ×
      </Dialog.Close>
    </header>
  );
}
