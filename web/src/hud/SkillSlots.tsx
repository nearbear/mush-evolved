// The three skill slots, then the book slot, overlaid on the top-right of a character portrait. Skills are public
// to everyone in the room; someone else's empty slots are left out. On your own portrait an empty slot is an amber socket with a gold plus that opens the picker; picks are
// permanent. The book slot is filled only by reading a skill book (an item action), so it never has a plus.
// Which skills can be picked comes from view.actions, never computed here.
// A Mush looking at their own portrait gets a toggle at the top that swaps the stack for their four Mush skill slots.
// It only changes what is drawn (to save space); both sets stay picked. Mush skills are only ever in your own view.
// The picker is a FramedDialog, like the settings window.

import { Dialog } from "@base-ui/react/dialog";
import { ConfirmPanel } from "./ConfirmPanel.tsx";
import { FramedDialog } from "./FramedDialog.tsx";
import { Hint } from "./IconButton.tsx";
import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isMushSkill, legalIn, MUSH_SKILL_SLOTS, SKILL_SLOTS, skillStatus, type Action, type PlayerView } from "@mush2/shared";
import { GOLD_PLUS_ICON, MUSH_ICON, skillIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import "./settings.css";
import "./terminal.css";

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
  const [showMush, setShowMush] = useState(false);
  const canToggle = isYou && view.you.role === "mush";
  const mush = canToggle && showMush;
  const offered = legalIn(view)
    .flatMap((a) => (a.type === "pick_skill" && isMushSkill(a.skill) === mush ? [a.skill] : []))
    .sort((a, b) => String(names.skill(a)).localeCompare(String(names.skill(b)), i18n.language));
  const slots = mush ? view.you.mushSkills : skills;

  return (
    <div className={mush ? "skill-slots skill-slots-mush" : "skill-slots"}>
      {canToggle && (
        <Hint label={t(mush ? "skills.showHuman" : "skills.showMush")}>
          <button
            type="button"
            className="skill-slot skill-toggle"
            aria-pressed={mush}
            aria-label={t("skills.mushToggle")}
            onClick={() => setShowMush(!mush)}
          >
            <img src={MUSH_ICON} alt="" />
          </button>
        </Hint>
      )}
      <ul>
        {Array.from({ length: mush ? MUSH_SKILL_SLOTS : SKILL_SLOTS }, (_, i) => {
          const skill = slots[i];
          // Someone else's empty slots aren't drawn, so they don't cover the portrait.
          if (!skill && !isYou) return null;
          return (
            <li key={i}>
              {skill ? (
                <SkillSlot skill={skill} />
              ) : (
                <Hint label={t(mush ? "skills.pickMush" : "skills.pick")}>
                  <button
                    type="button"
                    className="skill-slot skill-slot-open"
                    disabled={offered.length === 0}
                    aria-label={mush ? t("skills.mushSlot", { n: i + 1 }) : t("skills.slot", { n: i + 1 })}
                    onClick={() => setOpen(true)}
                  >
                    <img src={GOLD_PLUS_ICON} alt="" />
                  </button>
                </Hint>
              )}
            </li>
          );
        })}
        {!mush && (bookSkill || isYou) && (
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
        <FramedDialog className="skill-picker" heading={t(mush ? "skills.mushTitle" : "skills.title")} closeLabel={t("skills.close")}>
          <p className="skill-warning">{t("skills.warning")}</p>
          <ul className="skill-list">
            {offered.map((skill) => (
              <li key={skill}>
                <SkillCard skill={skill} onSelect={() => setPending(skill)} />
              </li>
            ))}
          </ul>
          <ConfirmPanel
            open={pending !== null}
            onOpenChange={(o) => !o && setPending(null)}
            message={t("skills.confirm", { skill: pending ? names.skill(pending) : "" })}
            yesLabel={t("skills.confirmYes")}
            backLabel={t("skills.back")}
            onYes={() => {
              if (!pending) return;
              onAction({ type: "pick_skill", skill: pending });
              setOpen(false);
              setPending(null);
            }}
          >
            {pending && <SkillCard skill={pending} />}
          </ConfirmPanel>
        </FramedDialog>
      </Dialog.Root>
    </div>
  );
}

/** A filled slot. The name and description open in a popover on hover, focus, or tap (touch has no hover). */
function SkillSlot({ skill }: { skill: string }) {
  const names = useNames();
  return (
    <SkillPopover skill={skill} className="skill-slot" aria-label={names.skill(skill)}>
      <img src={skillIcon(skill)} alt="" />
    </SkillPopover>
  );
}

/**
 * A button whose popover shows a skill's name, description and effects, opened on hover, focus, or tap.
 * The in-game skill slots use it, and so does the lobby's character pane, so a skill reads the same in both.
 */
export function SkillPopover({
  skill,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  skill: string;
  className: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const text = (group: "effects" | "desc"): string => t(`skills.${group}.${skill}` as never, { defaultValue: "" });
  const effects = text("effects").split("\n").filter(Boolean);
  const description = text("desc");
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className={className} aria-label={ariaLabel}>
        {children}
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
