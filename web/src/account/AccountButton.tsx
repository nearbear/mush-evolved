import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DialogHeader } from "../hud/DialogHeader.tsx";
import { type Account, AccountDetails } from "./AccountDetails.tsx";
import "../hud/settings.css";
import "./account.css";

/**
 * The lobby's account button (#66): the signed-in player's display name, opening a dialog with `AccountDetails`.
 * `onChange` reloads the account after a rename or logout.
 */
export function AccountButton({ account, onChange }: { account: Account; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="account-button" aria-label={t("account.button", { name: account.displayName })}>
        <span className="account-button-name">{account.displayName}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="account-popup">
          <DialogHeader heading={t("account.title")} closeLabel={t("account.close")} />
          <AccountDetails
            account={account}
            onChange={onChange}
            onLoggedOut={async () => {
              setOpen(false);
              await onChange();
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
