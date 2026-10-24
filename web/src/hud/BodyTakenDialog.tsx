// The pop-up a Transfer's victim must acknowledge (`you.bodyTakenBy`): a Mush took their body, and they now play the
// character it left. Cosmetic; it opens again after a reload until acknowledged, and only the button closes it.

import { Dialog } from "@base-ui/react/dialog";
import type { PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import "./settings.css";

export function BodyTakenDialog({ view, onAcknowledge }: { view: PlayerView; onAcknowledge: () => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const taker = view.you.bodyTakenBy;
  // Escape and the backdrop don't close it (onOpenChange ignored): acknowledging is the only way out.
  return (
    <Dialog.Root open={taker !== undefined} onOpenChange={() => {}}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup body-taken">
          <Dialog.Title className="settings-title">{t("bodyTaken.title")}</Dialog.Title>
          {taker && <Dialog.Description>{t("bodyTaken.text", { name: names.character(taker) })}</Dialog.Description>}
          <button type="button" onClick={onAcknowledge}>
            {t("bodyTaken.ok")}
          </button>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
