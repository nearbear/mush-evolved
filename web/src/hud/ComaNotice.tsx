import { useTranslation } from "react-i18next";
import type { PlayerView } from "@mush2/shared";
import { lyingSprite } from "../art/assets.ts";

/**
 * What a comatose player sees in place of the game screen (#489): total blindness until the coma wears off.
 */
export function ComaNotice({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const lying = lyingSprite(view.you.character);
  return (
    <section className="death-notice coma-notice">
      {lying && <div className="death-notice-sprite" style={lying} />}
      <h2>{t("coma.title")}</h2>
      <p>{t("coma.body")}</p>
    </section>
  );
}
