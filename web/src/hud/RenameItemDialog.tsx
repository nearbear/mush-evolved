// Modal dialog for renaming an owned item (friendly NPC, plant, or customized blaster).
// Submitting an empty name restores the item's default name.

import { Dialog } from "@base-ui/react/dialog";
import { MAX_ITEM_NAME_LENGTH } from "@mush2/shared";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./settings.css";

export function RenameItemDialog({
  open,
  itemName,
  currentName,
  onClose,
  onRename,
}: {
  open: boolean;
  itemName: string;
  currentName?: string | undefined;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(currentName ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(currentName ?? "");
      queueMicrotask(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, currentName]);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop confirm-backdrop" />
        <Dialog.Popup className="confirm-popup">
          <Dialog.Title className="confirm-message">{t("rename.title", { item: itemName })}</Dialog.Title>
          <form
            className="rename-form"
            onSubmit={(e) => {
              e.preventDefault();
              onRename(draft);
              onClose();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="rename-input"
              value={draft}
              maxLength={MAX_ITEM_NAME_LENGTH}
              placeholder={t("rename.placeholder")}
              aria-label={t("rename.placeholder")}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="sub rename-hint">{t("rename.hint")}</p>
            <div className="skill-confirm-buttons">
              <button type="button" onClick={onClose}>
                {t("rename.cancel")}
              </button>
              <button type="submit">{t("rename.save")}</button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
