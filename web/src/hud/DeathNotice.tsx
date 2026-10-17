import { useTranslation } from "react-i18next";
import { MUSH_CHANNEL, type PlayerView } from "@mush2/shared";
import { lyingSprite } from "../art/assets.ts";

/**
 * What a dead player sees where the room was: they see nothing room-based (#45), so the room
 * view is replaced by this notice. The iTrackie still shows the channels the view lets them read.
 */
export function DeathNotice({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const lying = lyingSprite(view.you.character);
  return (
    <section className="death-notice">
      {lying && <div className="death-notice-sprite" style={lying} />}
      <h2>{t("death.title")}</h2>
      <p>{view.readChannels.includes(MUSH_CHANNEL) ? t("death.bodyMush") : t("death.body")}</p>
    </section>
  );
}
