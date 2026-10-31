import { useTranslation } from "react-i18next";
import { AccountDetails } from "./AccountDetails.tsx";
import { useMe } from "./api.ts";
import "./account.css";

/**
 * The settings dialog's Account tab, on a ship (#321). Loads the account when the tab opens. Logging out ends this
 * device's seat (the server revokes its tokens) and goes back to the main menu; the account stays aboard, so signing in
 * again, here or on another device, resumes the ship.
 */
export function AccountSettings({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation();
  const { me, rateLimited, refresh } = useMe();

  if (me === null) return <p className="account-note">{t(rateLimited ? "account.errors.rate_limited" : "account.loading")}</p>;
  if (me.status !== "signed_in") return <p className="account-note">{t("account.signedOutInGame")}</p>;
  // Leaves even if the server couldn't revoke the seat (a failed revoke still signs out).
  return <AccountDetails account={me.account} onChange={refresh} inGame onLoggedOut={onLeave} />;
}
