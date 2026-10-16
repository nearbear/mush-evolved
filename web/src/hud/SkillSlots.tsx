// The three skill slots overlaid on the top-right of a character portrait. Skills are public to everyone in
// the room. On your own portrait an empty slot is a gold plus that opens the picker; picks are permanent.
// Which skills can be picked comes from view.legalActions, never computed here.

import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SKILL_SLOTS, type Action, type PlayerView } from "@mush2/shared";
import { GOLD_PLUS_ICON, skillIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import "./settings.css";

export function SkillSlots({
  view,
  skills,
  isYou,
  onAction,
}: {
  view: PlayerView;
  skills: readonly string[];
  isYou: boolean;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const offered = view.legalActions.flatMap((a) => (a.type === "pick_skill" ? [a.skill] : []));

  return (
    <div className="skill-slots">
      <ul>
        {Array.from({ length: SKILL_SLOTS }, (_, i) => {
          const skill = skills[i];
          return (
            <li key={i}>
              {skill ? (
                <SkillSlot skill={skill} />
              ) : (
                isYou && (
                  <button
                    type="button"
                    className="skill-slot"
                    disabled={offered.length === 0}
                    title={t("skills.pick")}
                    aria-label={t("skills.slot", { n: i + 1 })}
                    onClick={() => setOpen(true)}
                  >
                    <img src={GOLD_PLUS_ICON} alt="" />
                  </button>
                )
              )}
              {!skill && !isYou && <span className="skill-slot skill-slot-empty" />}
            </li>
          );
        })}
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
            <Dialog.Title className="settings-title">{t("skills.title")}</Dialog.Title>
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
            <Dialog.Close className="settings-close">{t("skills.close")}</Dialog.Close>
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
