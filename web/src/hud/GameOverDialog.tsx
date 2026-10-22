// Says who won once the game has ended (`view.winner`). It opens by itself when the game ends and can be closed to look
// around. A full end screen, with names and roles revealed, is its own issue (#191).

import { Dialog } from "@base-ui/react/dialog";
import type { PlayerView } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DialogHeader } from "./DialogHeader.tsx";
import "./settings.css";

export function GameOverDialog({ winner }: { winner: PlayerView["winner"] }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  if (winner === null) return null;
  return (
    <Dialog.Root open={!dismissed} onOpenChange={(open) => !open && setDismissed(true)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup">
          <DialogHeader heading={t("gameOver.title")} closeLabel={t("terminal.close")} />
          <p>{t(`gameOver.${winner}`)}</p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
