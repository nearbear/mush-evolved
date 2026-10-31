import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AUTH_PROVIDERS, type MeResponse } from "@mush2/shared";
import { DialogHeader } from "../hud/DialogHeader.tsx";
import { logout, PROVIDER_NAMES, rename, startSignIn } from "./api.ts";
import { NameForm } from "./NameForm.tsx";
import "../hud/settings.css";
import "./account.css";

type Account = Extract<MeResponse, { status: "signed_in" }>["account"];

/**
 * The account button (#66): the signed-in player's display name, opening a dialog to rename (once a day, #284),
 * add the sign-in method not linked yet, and log out. `onChange` reloads the account after any of them.
 */
export function AccountButton({ account, onChange }: { account: Account; onChange: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renamed, setRenamed] = useState(false);
  const renameAt = account.renameAllowedAt !== null && account.renameAllowedAt > Date.now() ? account.renameAllowedAt : null;
  const time = renameAt === null ? "" : new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(renameAt);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setRenaming(false);
          setRenamed(false);
        }
      }}
    >
      <Dialog.Trigger className="account-button" aria-label={t("account.button", { name: account.displayName })}>
        <span className="account-button-name">{account.displayName}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="account-popup">
          <DialogHeader heading={t("account.title")} closeLabel={t("account.close")} />
          <section className="account-section" aria-labelledby="account-name-heading">
            <h2 id="account-name-heading">{t("account.nameHeading")}</h2>
            <p className="account-name">{account.displayName}</p>
            {renamed && <p role="status">{t("account.renamed")}</p>}
            {renameAt !== null ? (
              <p className="account-note">{t("account.errors.too_soon", { time })}</p>
            ) : renaming ? (
              <NameForm
                initial={account.displayName}
                label={t("account.newName")}
                submitLabel={t("account.rename")}
                autoFocus
                onSubmit={async (name) => {
                  const result = await rename(name);
                  // Too soon (renamed on another device): reloading the account shows when it is allowed.
                  if (result.ok || result.reason === "too_soon") {
                    await onChange();
                    setRenaming(false);
                    setRenamed(result.ok);
                    return null;
                  }
                  return result.reason;
                }}
                secondary={
                  <button type="button" onClick={() => setRenaming(false)}>
                    {t("account.cancel")}
                  </button>
                }
              >
                <p className="account-note">{t("account.renameWarning")}</p>
              </NameForm>
            ) : (
              <button type="button" onClick={() => setRenaming(true)}>
                {t("account.changeName")}
              </button>
            )}
          </section>
          <section className="account-section" aria-labelledby="account-methods-heading">
            <h2 id="account-methods-heading">{t("account.methodsHeading")}</h2>
            <ul className="account-methods">
              {AUTH_PROVIDERS.map((provider) => (
                <li key={provider}>
                  {account.providers.includes(provider) ? (
                    <span>{t("account.linked", { provider: PROVIDER_NAMES[provider] })}</span>
                  ) : (
                    <button type="button" onClick={() => startSignIn(provider, true)}>
                      {t("account.addMethod", { provider: PROVIDER_NAMES[provider] })}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <button
            type="button"
            className="account-logout"
            onClick={async () => {
              await logout().catch(() => undefined);
              setOpen(false);
              await onChange();
            }}
          >
            {t("account.logout")}
          </button>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
