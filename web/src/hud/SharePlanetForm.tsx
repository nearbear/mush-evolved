// The Astro terminal's Share form (owner, 2026-10-31; structured, owner 2026-11-19, docs/plans/expedition-ui.md): one
// of your planets as the crew will read it in the Astrophysics feature. The name is the planet's and can't be changed;
// there is one sector slot per sector of the planet, each starting as what you know (the tag, or unknown) and
// changeable to any tag or unknown, lies included; then free text, prefilled with the name and position, which you
// may change in any way. A disclaimer says what the crew can check. The server only moderates the text and checks the
// slots' count and tags. It takes the planet's place in the terminal window rather than opening a second modal over it
// (owner, 2026-11-14); Back returns to the planet.

import { MAX_SHARED_PLANET_LENGTH, PLANET_TAG_IDS, type PlanetTag, type PlanetView } from "@mush2/shared";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hint } from "./IconButton.tsx";
import { SectorIcon, useSectorName } from "./SectorIcon.tsx";

/** What a slot can be set to: unknown first, then every tag. */
const CHOICES: readonly (PlanetTag | null)[] = [null, ...PLANET_TAG_IDS];

export function SharePlanetForm({ planet, onPost, onBack }: { planet: PlanetView; onPost: (sectors: (PlanetTag | null)[], text: string) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const headingId = useId();
  const pickerId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sectorName = useSectorName();
  // Mounted fresh each time Share is pressed, so the slots and text start again from the planet as it is now.
  const [sectors, setSectors] = useState<(PlanetTag | null)[]>(() => [...planet.sectors]);
  const [text, setText] = useState(() =>
    [t("astro.shareName", { name: planet.name }), t("astro.sharePosition", { direction: t(`astro.directions.${planet.direction}`), distance: planet.distance })].join("\n"),
  );
  // The slot whose picker is open, if any.
  const [editing, setEditing] = useState<number | null>(null);
  // The Share button that opened this is gone, so focus moves to the first slot.
  const firstSlot = useRef<HTMLButtonElement>(null);
  useEffect(() => (firstSlot.current ?? textRef.current)?.focus(), []);
  const choose = (i: number, tag: PlanetTag | null) => {
    setSectors((s) => s.map((old, j) => (j === i ? tag : old)));
    setEditing(null);
  };
  return (
    <form
      className="share-planet-form"
      aria-labelledby={headingId}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onPost(sectors, text);
      }}
    >
      <h3 id={headingId}>{t("astro.shareTitle", { name: planet.name })}</h3>
      <p className="sub">{t("astro.shareHint")}</p>
      <fieldset className="share-planet-slots">
        <legend>{t("astro.shareSectorsLabel")}</legend>
        <ul>
          {sectors.map((tag, i) => (
            <li key={i}>
              <button
                ref={i === 0 ? firstSlot : undefined}
                type="button"
                className="share-planet-slot"
                aria-label={t("astro.shareSlot", { n: i + 1, sector: sectorName(tag) })}
                aria-expanded={editing === i}
                aria-controls={editing === i ? pickerId : undefined}
                onClick={() => setEditing(editing === i ? null : i)}
              >
                <SectorIcon sector={tag} />
              </button>
            </li>
          ))}
        </ul>
        {editing !== null && (
          <div id={pickerId} className="share-planet-picker" role="group" aria-label={t("astro.shareSlotPicker", { n: editing + 1 })}>
            {CHOICES.map((tag) => (
              <Hint key={tag ?? "unknown"} label={sectorName(tag)}>
                <button type="button" className="share-planet-choice" aria-label={sectorName(tag)} aria-pressed={sectors[editing] === tag} onClick={() => choose(editing, tag)}>
                  <SectorIcon sector={tag} />
                </button>
              </Hint>
            ))}
          </div>
        )}
      </fieldset>
      <p className="sub share-planet-disclaimer">{t("astro.shareDisclaimer")}</p>
      <label className="share-planet-text">
        <span>{t("astro.shareLabel")}</span>
        <textarea ref={textRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_SHARED_PLANET_LENGTH} rows={4} />
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
