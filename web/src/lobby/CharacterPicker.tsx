import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CHARACTERS, CHARACTER_SKILLS, DIFFICULTIES, type CharacterId, type Difficulty } from "@mush2/shared";
import { STAR_ICON, characterImage, skillIcon, standingSprite } from "../art/assets.ts";
import { DialogHeader } from "../hud/DialogHeader.tsx";
import { SkillPopover } from "../hud/SkillSlots.tsx";
import { useNames } from "../i18n/names.ts";
import { useMobile } from "../useMobile.ts";
import "../hud/settings.css";

const LEVEL = { 1: "easy", 2: "medium", 3: "hard" } as const satisfies Record<Difficulty, string>;

type Character = (typeof CHARACTERS)[number];

/** The crew in tiers, easiest first, alphabetical by given name (what the cards show) within a tier. */
const TIERS = DIFFICULTIES.map((difficulty) => ({
  difficulty,
  crew: CHARACTERS.filter((c) => c.difficulty === difficulty).sort((a, b) => a.given.localeCompare(b.given)),
}));
const ORDER = TIERS.flatMap((tier) => tier.crew);

/** Filled and empty (grayscale) stars for a difficulty; decoration only, the text label next to it says the same. */
function Stars({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className="pod-stars" aria-hidden="true">
      {DIFFICULTIES.map((d) => (
        <img key={d} className={d <= difficulty ? "pod-star" : "pod-star pod-star-off"} src={STAR_ICON} alt="" />
      ))}
    </span>
  );
}

/**
 * The character step. Desktop: three rows of standing sprites on podiums, one per difficulty (labelled
 * sideways on the left), with the prompt and a pane on the right for the selected crew member and the button
 * that boards; selection starts on the first one still free. Phone: the prompt, a tab per difficulty (three sprites
 * a row), and tapping a crew member opens their details in a modal with the button that boards.
 */
export function CharacterPicker({ taken, onBoard }: { taken: readonly CharacterId[]; onBoard: (character: CharacterId) => void }) {
  const mobile = useMobile();
  const free = (id: CharacterId) => !taken.includes(id);
  return mobile ? <PhonePicker free={free} onBoard={onBoard} /> : <DesktopPicker free={free} onBoard={onBoard} />;
}

function Prompt() {
  const { t } = useTranslation();
  return <p className="pod-subtitle pod-prompt">{t("lobby.pickCharacter")}</p>;
}

type PickerProps = { free: (id: CharacterId) => boolean; onBoard: (character: CharacterId) => void };

function DesktopPicker({ free, onBoard }: PickerProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<CharacterId | null>(null);
  // Someone may take the selected one while you look: fall back to the first free one.
  const current = selected && free(selected) ? selected : (ORDER.find((c) => free(c.id))?.id ?? null);

  return (
    <div className="pod-picker">
      <div className="pod-tiers">
        {TIERS.map(({ difficulty, crew }) => (
          <section key={difficulty} className="pod-tier" aria-labelledby={`pod-tier-${difficulty}`}>
            <h2 className="pod-tier-heading" id={`pod-tier-${difficulty}`}>
              <Stars difficulty={difficulty} />
              <span className="pod-tier-label">{t(`lobby.difficulty.${LEVEL[difficulty]}`)}</span>
            </h2>
            <Crew crew={crew} free={free} current={current} onPick={setSelected} />
          </section>
        ))}
      </div>
      <div className="pod-side">
        <Prompt />
        <div className="pod-detail">
          {/* The portrait with the selected crew member's skills beside it. */}
          <div className="pod-detail-top">
            <img className="pod-detail-portrait" src={characterImage(current ?? undefined)} alt="" />
            {/* Every crew member's skills and text in one grid cell each, only the selected one visible, so the pane
                is always sized to the longest (in any language) and never changes height between selections. */}
            <div className="pod-detail-stack">
              {ORDER.map((c) => (
                <div key={c.id} className="pod-detail-stacked" inert={c.id !== current}>
                  <CharacterSkills character={c} tooltips />
                </div>
              ))}
            </div>
          </div>
          <div className="pod-detail-stack pod-detail-texts">
            {ORDER.map((c) => (
              <div key={c.id} className="pod-detail-stacked pod-detail-text" inert={c.id !== current}>
                <CharacterText character={c} tooltips skills={false} />
              </div>
            ))}
          </div>
          <button type="button" className="big pod-board" disabled={current === null} onClick={() => current && onBoard(current)}>
            {t("lobby.board")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhonePicker({ free, onBoard }: PickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<CharacterId | null>(null);
  // Someone may take the one you're looking at: the modal closes.
  const shown = open && free(open) ? CHARACTERS.find((c) => c.id === open) : undefined;

  return (
    <div className="pod-picker">
      <Prompt />
      <Tabs.Root className="pod-tabs" defaultValue={TIERS[0]?.difficulty}>
        <Tabs.List className="settings-tab-list">
          {TIERS.map(({ difficulty }) => (
            <Tabs.Tab key={difficulty} className="settings-tab pod-tab" value={difficulty}>
              <Stars difficulty={difficulty} />
              {t(`lobby.difficulty.${LEVEL[difficulty]}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {TIERS.map(({ difficulty, crew }) => (
          <Tabs.Panel key={difficulty} className="pod-tab-panel" value={difficulty} keepMounted>
            <Crew crew={crew} free={free} onPick={setOpen} />
          </Tabs.Panel>
        ))}
      </Tabs.Root>
      <Dialog.Root open={shown !== undefined} onOpenChange={(o) => !o && setOpen(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="settings-backdrop" />
          <Dialog.Popup className="pod-dialog">
            {shown && (
              <>
                <DialogHeader heading={shown.name} closeLabel={t("lobby.closeCharacter")} />
                <div className="pod-dialog-body">
                  <img className="pod-detail-portrait" src={characterImage(shown.id)} alt="" />
                  <div className="pod-detail-text">
                    <CharacterText character={shown} />
                  </div>
                </div>
                <button type="button" className="big pod-board" onClick={() => onBoard(shown.id)}>
                  {t("lobby.board")}
                </button>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/**
 * One tier's standing sprites. With `current` (desktop) a tile is a toggle showing which one is selected;
 * without it (phone) a tile opens the details modal.
 */
function Crew({
  crew,
  free,
  current,
  onPick,
}: {
  crew: readonly Character[];
  free: (id: CharacterId) => boolean;
  current?: CharacterId | null;
  onPick: (id: CharacterId) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="pod-characters">
      {crew.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className="pod-character"
            {...(current === undefined ? { "aria-haspopup": "dialog" as const } : { "aria-pressed": c.id === current })}
            disabled={!free(c.id)}
            onClick={() => onPick(c.id)}
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
  );
}

/**
 * Who they are: name (desktop only; the modal has it as its title), profession, difficulty, and skills
 * unless `skills` is false (desktop shows them beside the portrait instead).
 */
function CharacterText({ character: c, tooltips = false, skills = true }: { character: Character; tooltips?: boolean; skills?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      {tooltips && <p className="pod-detail-name">{c.name}</p>}
      <p className="pod-detail-profession">{t(`characters.profession.${c.id}`)}</p>
      <p className="pod-detail-difficulty">
        <Stars difficulty={c.difficulty} />
        {t("lobby.difficultyLabel", { level: t(`lobby.difficulty.${LEVEL[c.difficulty]}`) })}
      </p>
      {skills && <CharacterSkills character={c} tooltips={tooltips} />}
    </>
  );
}

/** A crew member's starting skills, icon and name each. */
function CharacterSkills({ character: c, tooltips = false }: { character: Character; tooltips?: boolean }) {
  const { t } = useTranslation();
  const names = useNames();
  return (
      <ul className="pod-detail-skills" aria-label={t("lobby.characterSkills")}>
        {CHARACTER_SKILLS[c.id].map((skill) => (
          <li key={skill}>
            {/* Desktop: the same popover as the in-game skill slot. Phone: plain, the modal is details enough. */}
            {tooltips ? (
              <SkillPopover skill={skill} className="pod-skill">
                <img src={skillIcon(skill)} alt="" />
                {names.skill(skill)}
              </SkillPopover>
            ) : (
              <span className="pod-skill">
                <img src={skillIcon(skill)} alt="" />
                {names.skill(skill)}
              </span>
            )}
          </li>
        ))}
      </ul>
  );
}
