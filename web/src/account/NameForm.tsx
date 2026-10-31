import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { checkDisplayName, MAX_NAME_LENGTH } from "@mush2/shared";
import "./account.css";

/** An error code from `account.errors` (`DisplayNameError`, a server refusal, or `network`). */
export type NameError = string;

/**
 * A display name field with its submit button, used by the sign-up name step and the rename dialog. The name is
 * checked here first (`checkDisplayName`, the server's own check) so most mistakes show without a round trip.
 * `onSubmit` resolves to an error code, or null once the name is saved.
 */
export function NameForm({
  initial,
  label,
  submitLabel,
  onSubmit,
  children,
  secondary,
  autoFocus = false,
}: {
  initial: string;
  label: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<NameError | null>;
  /** Shown between the field and the buttons (a warning). */
  children?: ReactNode;
  /** A second button beside the submit button (cancel). */
  secondary?: ReactNode;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<NameError | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="name-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        const checked = checkDisplayName(value);
        if (!checked.ok) {
          setError(checked.reason);
          return;
        }
        setBusy(true);
        setError(null);
        void onSubmit(checked.name)
          .catch(() => "network")
          .then((result) => {
            setBusy(false);
            setError(result);
          });
      }}
    >
      <label className="name-form-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="name-form-input"
        value={value}
        // Room for whitespace the check folds away; the check reports a name that is still too long.
        maxLength={MAX_NAME_LENGTH * 2}
        autoComplete="nickname"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      <p id={`${id}-error`} className="name-form-error" role="alert">
        {error && t(`account.errors.${error}` as never, { max: MAX_NAME_LENGTH, defaultValue: t("account.errors.network") })}
      </p>
      {children}
      <div className="name-form-buttons">
        <button type="submit" disabled={busy}>
          {submitLabel}
        </button>
        {secondary}
      </div>
    </form>
  );
}
