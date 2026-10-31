import type { PlayerView, RelayTargetView } from "@mush2/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { CrewAvatar } from "./FeedEntry.tsx";

/** A work button's text with the gain if you contribute now (relay tokens, docs/relay-tokens.md): "Progress +6-9%". */
export function withGain(t: TFunction, action: string, gain: RelayTargetView["gain"] | undefined): string {
  if (!gain) return action;
  const text = gain.min === gain.max ? t("relay.gainOne", { min: gain.min }) : t("relay.gain", { min: gain.min, max: gain.max });
  return t("relay.withGain", { action, gain: text });
}

/** The one-line rule shown at the top of a research, project or PILGRED terminal (owner's wording, 2026-10-31). */
export function RelayHelp() {
  const { t } = useTranslation();
  return <p className="relay-help">{t("relay.help")}</p>;
}

/**
 * Under a target's progress bar: the work held back only for lack of other contributors, and its tokens (who made each
 * and what it is worth now), in the order they were made. Only the view's own numbers; nothing is computed here.
 */
export function RelayDetails({ target, view }: { target: RelayTargetView | undefined; view: PlayerView }) {
  const { t } = useTranslation();
  const names = useNames();
  if (!target) return null;
  const characterOf = (id: string) => [view.you, ...view.players].find((p) => p.id === id)?.character;
  return (
    <>
      {target.waiting > 0 && <p className="relay-waiting">{t("relay.waiting", { percent: target.waiting })}</p>}
      {target.tokens.length > 0 && (
        <ul className="relay-tokens" aria-label={t("relay.tokens")}>
          {target.tokens.map((token, i) => {
            const character = characterOf(token.by);
            const who = character ? names.character(character) : t("relay.unknown");
            return (
              // Tokens are only ever appended, so the index is a stable key.
              <li key={i} aria-label={t("relay.token", { name: who, percent: token.value })}>
                <CrewAvatar character={character} />
                <span aria-hidden="true">{t("research.percent", { percent: token.value })}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
