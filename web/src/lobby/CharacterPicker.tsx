import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CHARACTERS, CHARACTER_SKILLS, DIFFICULTIES, type CharacterId, type Difficulty } from "@mush2/shared";
import { characterImage, skillIcon, standingSprite } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";

const LEVEL = { 1: "easy", 2: "medium", 3: "hard" } as const satisfies Record<Difficulty, string>;

/** The crew in tiers, easiest first, alphabetical by given name (what the cards show) within a tier. */
const TIERS = DIFFICULTIES.map((difficulty) => ({
  difficulty,
  crew: CHARACTERS.filter((c) => c.difficulty === difficulty).sort((a, b) => a.given.localeCompare(b.given)),
}));
const ORDER = TIERS.flatMap((tier) => tier.crew);

/** Filled and empty pips for a difficulty; decoration only, the text label next to it says the same. */
function Pips({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className="pod-pips" aria-hidden="true">
      {DIFFICULTIES.map((d) => (
        <span key={d} className={d <= difficulty ? "pod-pip pod-pip-on" : "pod-pip"} />
      ))}
    </span>
  );
}

/**
 * The character step: standing sprites on podiums, grouped by difficulty, and a detail pane for the
 * selected crew member with the button that boards. Selection starts on the first one still free.
 */
export function CharacterPicker({ taken, onBoard }: { taken: readonly CharacterId[]; onBoard: (character: CharacterId) => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const [selected, setSelected] = useState<CharacterId | null>(null);
  // Someone may take the selected one while you look: fall back to the first free one.
  const free = (id: CharacterId) => !taken.includes(id);
  const current = selected && free(selected) ? selected : (ORDER.find((c) => free(c.id))?.id ?? null);

  return (
    <div className="pod-picker">
      <div className="pod-tiers">
        {TIERS.map(({ difficulty, crew }) => (
          <section key={difficulty} className="pod-tier" aria-labelledby={`pod-tier-${difficulty}`}>
            <h2 className="pod-tier-heading" id={`pod-tier-${difficulty}`}>
              <Pips difficulty={difficulty} />
              {t(`lobby.difficulty.${LEVEL[difficulty]}`)}
            </h2>
            <ul className="pod-characters">
              {crew.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="pod-character"
                    aria-pressed={c.id === current}
                    disabled={!free(c.id)}
                    onClick={() => setSelected(c.id)}
                  >
                    <span className="pod-figure" aria-hidden="true">
                      <span className="pod-podium" />
                      <span className="pod-sprite" style={standingSprite(c.id)} />
                    </span>
                    <span className="pod-character-name">{c.given}</span>
                    {!free(c.id) && <span className="pod-character-taken">{t("lobby.taken")}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="pod-detail">
        <img className="pod-detail-portrait" src={characterImage(current ?? undefined)} alt="" />
        {/* Every crew member's text in one grid cell, only the selected one visible, so the pane is
            always sized to the longest (in any language) and never changes height between selections. */}
        <div className="pod-detail-texts">
          {ORDER.map((c) => (
            <div key={c.id} className="pod-detail-text" inert={c.id !== current}>
              <p className="pod-detail-name">{c.name}</p>
              <p className="pod-detail-profession">{t(`characters.profession.${c.id}`)}</p>
              <p className="pod-detail-difficulty">
                <Pips difficulty={c.difficulty} />
                {t("lobby.difficultyLabel", { level: t(`lobby.difficulty.${LEVEL[c.difficulty]}`) })}
              </p>
              <ul className="pod-detail-skills" aria-label={t("lobby.characterSkills")}>
                {CHARACTER_SKILLS[c.id].map((skill) => (
                  <li key={skill}>
                    <img src={skillIcon(skill)} alt="" />
                    {names.skill(skill)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <button type="button" className="big pod-board" disabled={current === null} onClick={() => current && onBoard(current)}>
          {t("lobby.board")}
        </button>
      </div>
    </div>
  );
}
