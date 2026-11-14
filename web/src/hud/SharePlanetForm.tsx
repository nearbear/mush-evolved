// The Astro terminal's Share form (owner, 2026-10-31): a text version of one of your planets, which you may change in
// any way (lies included) before posting it to the Astrophysics feature. The text is never parsed; the server only
// moderates it and checks its length. It takes the planet's place in the terminal window rather than opening a second
// modal over it (owner, 2026-11-14); Back returns to the planet.

import { MAX_SHARED_PLANET_LENGTH, type PlanetView } from "@mush2/shared";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function SharePlanetForm({ planet, onPost, onBack }: { planet: PlanetView; onPost: (text: string) => void; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Mounted fresh each time Share is pressed, so the text starts again from the planet as it is now.
  const [text, setText] = useState(() => {
    const sectors = planet.sectors.map((tag) => (tag === null ? t("astro.shareUnknownSector") : t(`astro.tags.${tag}` as never, { defaultValue: tag })));
    return [
      t("astro.shareName", { name: planet.name }),
      t("astro.sharePosition", { direction: t(`astro.directions.${planet.direction}`), distance: planet.distance }),
      t("astro.shareSectors", { sectors: new Intl.ListFormat(i18n.language, { type: "unit", style: "short" }).format(sectors) }),
    ].join("\n");
  });
  // The Share button that opened this is gone, so focus moves to the text.
  useEffect(() => textRef.current?.focus(), []);
  return (
    <form
      className="share-planet-form"
      aria-labelledby={headingId}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onPost(text);
      }}
    >
      <h3 id={headingId}>{t("astro.shareTitle", { name: planet.name })}</h3>
      <p className="sub">{t("astro.shareHint")}</p>
      <label className="share-planet-text">
        <span>{t("astro.shareLabel")}</span>
        <textarea ref={textRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_SHARED_PLANET_LENGTH} rows={6} />
      </label>
      <span className="sub share-planet-count" aria-hidden="true">
        {text.length}/{MAX_SHARED_PLANET_LENGTH}
      </span>
      <div className="share-planet-buttons">
        <button type="button" onClick={onBack}>
          {t("astro.back")}
        </button>
        <button type="submit" disabled={!text.trim()}>
          {t("astro.sharePost")}
        </button>
      </div>
    </form>
  );
}
