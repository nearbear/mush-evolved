// The window opened by accessing a terminal. Blank for now: just the terminal's name.
// Open/closed is UI state held by GameScreen; the server only validates the access action.

import { Dialog } from "@base-ui/react/dialog";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import "./settings.css";

export function TerminalDialog({ type, onClose }: { type: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <Dialog.Root open={type !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup">
          <Dialog.Title className="settings-title">{type && names.equipment(type)}</Dialog.Title>
          <Dialog.Close>{t("terminal.close")}</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
