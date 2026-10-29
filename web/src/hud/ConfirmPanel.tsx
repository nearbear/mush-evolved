// The shared "are you sure?" modal: a message, a back button and a confirm button. The caller keeps the `open` state
// (set when the button that starts the action is pressed) and says what the buttons read. Back, Escape and a click on
// the backdrop all dismiss it.

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import "./settings.css";

interface Props {
  open: boolean;
  /** Called with false when dismissed without confirming. */
  onOpenChange: (open: boolean) => void;
  message: string;
  yesLabel: string;
  backLabel: string;
  onYes: () => void;
  /** Shown above the message, e.g. a card for what is being confirmed. */
  children?: ReactNode;
}

export function ConfirmPanel({ open, onOpenChange, message, yesLabel, backLabel, onYes, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop confirm-backdrop" />
        <Dialog.Popup className="confirm-popup">
          {children}
          <Dialog.Title className="confirm-message">{message}</Dialog.Title>
          <div className="skill-confirm-buttons">
            <button type="button" onClick={() => onOpenChange(false)}>
              {backLabel}
            </button>
            <button type="button" onClick={onYes}>
              {yesLabel}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
