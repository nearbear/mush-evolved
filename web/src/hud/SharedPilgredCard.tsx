// Pinned PILGRED repair progress card shown above the PILGRED feature thread (owner, 2026-11-21).
// Displays the latest snapshot shared from the PILGRED terminal (`view.sharedPilgred`) as a single progress bar.

import { memo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { PILGRED_COMPLETE, type PlayerView, type SharedPilgredStatus } from "@mush2/shared";
import { useNames } from "../i18n/names.ts";

export const SharedPilgredCard = memo(
  function SharedPilgredCard({ shared, view }: { shared: SharedPilgredStatus; view: PlayerView }) {
    const { t } = useTranslation();
    const names = useNames();
    const author = (id: string) =>
      names.character((id === view.you.id ? view.you : view.players.find((p) => p.id === id))?.character ?? id);
    const byLine = t("itrackie.sharedPlanets.by", {
      name: author(shared.by),
      day: shared.day,
      cycle: shared.cycleOfDay,
    });
    const percent = shared.percent;

    return (
      <section className="shared-plants-card shared-pilgred-card" aria-label={t("itrackie.sharedPilgred.title")}>
        <div className="shared-plants-card-head">
          <div>
            <strong className="shared-plants-card-title">{t("itrackie.sharedPilgred.title")}</strong>
            <p className="sub">{byLine}</p>
          </div>
        </div>
        <div className="research-progress">
          <div
            className="kit-progress neron"
            role="progressbar"
            aria-label={t("pilgred.label")}
            aria-valuemin={0}
            aria-valuemax={PILGRED_COMPLETE}
            aria-valuenow={percent}
            style={{ "--value": Math.min(1, percent / PILGRED_COMPLETE) } as CSSProperties}
          />
          <span>{t("research.percent", { percent })}</span>
        </div>
        {shared.text && <p className="shared-plants-note">{shared.text}</p>}
      </section>
    );
  },
  (a, b) => a.shared === b.shared && a.view.you.character === b.view.you.character && a.view.players === b.view.players,
);
