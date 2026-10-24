// The three skill slots, then the book slot, overlaid on the top-right of a character portrait. Skills are public
// to everyone in the room; someone else's empty slots are left out. On your own portrait an empty slot is a gold plus that opens the picker; picks are
// permanent. The book slot is filled only by reading a skill book (an item action), so it never has a plus.
// Which skills can be picked comes from view.actions, never computed here.

import { Dialog } from "@base-ui/react/dialog";
import { DialogHeader } from "./DialogHeader.tsx";
import { Hint } from "./IconButton.tsx";
import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { legalIn, SKILL_SLOTS, skillStatus, type Action, type PlayerView } from "@mush2/shared";
import { GOLD_PLUS_ICON, skillIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import "./settings.css";

export function SkillSlots({
  view,
  skills,
  bookSkill,
  isYou,
  onAction,
}: {
  view: PlayerView;
  skills: readonly string[];
  bookSkill?: string;
  isYou: boolean;
  onAction: (action: Action) => void;
}) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const offered = legalIn(view)
    .flatMap((a) => (a.type === "pick_skill" ? [a.skill] : []))
    .sort((a, b) => String(names.skill(a)).localeCompare(String(names.skill(b)), i18n.language));

  return (
    <div className="skill-slots">
      <ul>
        {Array.from({ length: SKILL_SLOTS }, (_, i) => {
          const skill = skills[i];
          // Someone else's empty slots aren't drawn, so they don't cover the portrait.
          if (!skill && !isYou) return null;
          return (
            <li key={i}>
              {skill ? (
                <SkillSlot skill={skill} />
              ) : (
                <Hint label={t("skills.pick")}>
                  <button
                    type="button"
                    className="skill-slot"
                    disabled={offered.length === 0}
                    aria-label={t("skills.slot", { n: i + 1 })}
                    onClick={() => setOpen(true)}
                  >
                    <img src={GOLD_PLUS_ICON} alt="" />
                  </button>
                </Hint>
              )}
            </li>
          );
        })}
        {(bookSkill || isYou) && (
          <li className="skill-slot-book">
            {bookSkill ? (
              <SkillSlot skill={bookSkill} />
            ) : (
              <Hint label={t("skills.bookSlotHint")}>
                <span className="skill-slot skill-slot-empty" role="img" aria-label={t("skills.bookSlot")} />
              </Hint>
            )}
          </li>
        )}
      </ul>
      <Dialog.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPending(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="settings-backdrop" />
          <Dialog.Popup className="settings-popup skill-picker">
            <DialogHeader heading={t("skills.title")} closeLabel={t("skills.close")} />
            <p className="skill-warning">{t("skills.warning")}</p>
            {pending ? (
              <div className="skill-confirm">
                <SkillCard skill={pending} />
                <p>{t("skills.confirm", { skill: names.skill(pending) })}</p>
                <div className="skill-confirm-buttons">
                  <button type="button" onClick={() => setPending(null)}>
                    {t("skills.back")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAction({ type: "pick_skill", skill: pending });
                      setOpen(false);
                      setPending(null);
                    }}
                  >
                    {t("skills.confirmYes")}
                  </button>
                </div>
              </div>
            ) : (
              <ul className="skill-list">
                {offered.map((skill) => (
                  <li key={skill}>
                    <SkillCard skill={skill} onSelect={() => setPending(skill)} />
                  </li>
                ))}
              </ul>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** A filled slot. The name and description open in a popover on hover, focus, or tap (touch has no hover). */
function SkillSlot({ skill }: { skill: string }) {
  const { t } = useTranslation();
  const names = useNames();
  const text = (group: "effects" | "desc"): string => t(`skills.${group}.${skill}` as never, { defaultValue: "" });
  const effects = text("effects").split("\n").filter(Boolean);
  const description = text("desc");
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="skill-slot" aria-label={names.skill(skill)}>
        <img src={skillIcon(skill)} alt="" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card skill-card">
            <strong>{names.skill(skill)}</strong>
            {description && <p>{description}</p>}
            {effects.length > 0 && (
              <ul>
                {effects.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** An outlined card: title, icon, description. With onSelect the whole card is the click target (a div, not a
 * button, so it keeps the card look instead of the Mush button sprites). */
function SkillCard({ skill, onSelect }: { skill: string; onSelect?: () => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const effects = String(t(`skills.effects.${skill}` as never, { defaultValue: "" })).split("\n").filter(Boolean);
  const status = skillStatus(skill);
  const interactive = onSelect
    ? {
        role: "button",
        tabIndex: 0,
        onClick: onSelect,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        },
      }
    : {};
  return (
    <div className="skill-pick-card" {...interactive}>
      <header>
        <img src={skillIcon(skill)} alt="" />
        <strong>{names.skill(skill)}</strong>
      </header>
      <span className={`skill-status skill-status-${status}`}>{t(`skills.status.${status}`)}</span>
      {effects.length > 0 && (
        <ul>
          {effects.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
