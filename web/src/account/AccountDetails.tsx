import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AUTH_PROVIDERS, type MeResponse } from "@mush2/shared";
import { logout, PROVIDER_NAMES, rename, startSignIn } from "./api.ts";
import { NameForm } from "./NameForm.tsx";
import "./account.css";

export type Account = Extract<MeResponse, { status: "signed_in" }>["account"];

/**
 * The account's details and controls (#66), shared by the lobby's account dialog and the in-game settings (#321):
 * the display name and renaming (once a day, #284), adding the sign-in method not linked yet, and logging out.
 * `onChange` reloads the account after a rename; `onLoggedOut` runs after logging out.
 */
export function AccountDetails({
  account,
  onChange,
  onLoggedOut,
  inGame = false,
}: {
  account: Account;
  onChange: () => Promise<void>;
  onLoggedOut: () => Promise<void> | void;
  /** On a ship: a rename doesn't change the name the ship already knows you by, so say so. */
  inGame?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [renamed, setRenamed] = useState(false);
  const renameAt = account.renameAllowedAt !== null && account.renameAllowedAt > Date.now() ? account.renameAllowedAt : null;
  const time = renameAt === null ? "" : new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(renameAt);

  return (
    <>
      <section className="account-section" aria-labelledby="account-name-heading">
        <h2 id="account-name-heading">{t("account.nameHeading")}</h2>
        <p className="account-name">{account.displayName}</p>
        {renamed && <p role="status">{t(inGame ? "account.renamedInGame" : "account.renamed")}</p>}
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
            {inGame && <p className="account-note">{t("account.renameNextShip")}</p>}
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
      <section className="account-section">
        {inGame && <p className="account-note">{t("account.logoutInGame")}</p>}
        <button
          type="button"
          className="account-logout"
          onClick={async () => {
            await logout().catch(() => undefined);
            await onLoggedOut();
          }}
        >
          {t("account.logout")}
        </button>
      </section>
    </>
  );
}
