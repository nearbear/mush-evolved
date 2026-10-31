// The Astro terminal's Share dialog (owner, 2026-10-31): a text version of one of your planets, which you may change
// in any way (lies included) before posting it to the Astrophysics feature. The text is never parsed; the server only
// moderates it and checks its length.

import { Dialog } from "@base-ui/react/dialog";
import { MAX_SHARED_PLANET_LENGTH, type PlanetView } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DialogHeader } from "./DialogHeader.tsx";
import "./settings.css";

export function SharePlanetDialog({
  planet,
  open,
  onOpenChange,
  onShare,
}: {
  planet: PlanetView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShare: (planet: string, text: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup">
          <DialogHeader heading={t("astro.shareTitle", { name: planet.name })} closeLabel={t("astro.shareClose")} />
          {/* The popup unmounts when closed, so each opening starts again from the planet as it is now. */}
          <ShareForm
            planet={planet}
            onPost={(text) => {
              onShare(planet.id, text);
              onOpenChange(false);
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ShareForm({ planet, onPost }: { planet: PlanetView; onPost: (text: string) => void }) {
  const { t, i18n } = useTranslation();
  // The planet as you see it, unknown sectors as "?".
  const [text, setText] = useState(() => {
    const sectors = planet.sectors.map((tag) => (tag === null ? t("astro.shareUnknownSector") : t(`astro.tags.${tag}` as never, { defaultValue: tag })));
    return [
      t("astro.shareName", { name: planet.name }),
      t("astro.sharePosition", { direction: t(`astro.directions.${planet.direction}`), distance: planet.distance }),
      t("astro.shareSectors", { sectors: new Intl.ListFormat(i18n.language, { type: "unit", style: "short" }).format(sectors) }),
    ].join("\n");
  });
  return (
    <form
      className="share-planet-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onPost(text);
      }}
    >
      <p className="sub">{t("astro.shareHint")}</p>
      <label className="share-planet-text">
        <span>{t("astro.shareLabel")}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_SHARED_PLANET_LENGTH} rows={6} />
      </label>
      <span className="sub share-planet-count" aria-hidden="true">
        {text.length}/{MAX_SHARED_PLANET_LENGTH}
      </span>
      <button type="submit" disabled={!text.trim()}>
        {t("astro.sharePost")}
      </button>
    </form>
  );
}
