// A button for an offered action, with a card (on hover, focus, or tap) giving its odds of dirt and injury when it has any. When you only lack the AP or MP for it (or are too dirty, or there's no debris to collect...), it shows disabled and a card
// says why (on hover, focus, or tap). It uses aria-disabled rather than disabled so it can still be hovered,
// focused and tapped to read the reason.

import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConsumeEffects } from "./ConsumeEffects.tsx";
import { HP_ICON, STATUS_ICONS } from "../art/assets.ts";
import { SINGLE_PRESS_ACTIONS, useDoublePress } from "./DoublePress.tsx";
import { affordable, blurredVision, type Action, type ActionOption, type PlayerView } from "@mush2/shared";

/** A button that does the action on a double press (useDoublePress; one press for SINGLE_PRESS_ACTIONS or `singlePress`), or the disabled one with the reason when you lack the points. */
export function ActionButton(props: {
  view: PlayerView;
  option: ActionOption;
  onAction: (action: Action) => void;
  children?: ReactNode;
  className?: string;
  hint?: string;
  singlePress?: boolean;
  switchProps?: { checked: boolean; label: string };
  radioProps?: { checked: boolean };
}) {
  const { view, option, children, hint, switchProps, radioProps } = props;
  // Pink Eye blurs the buttons' text (blurredVision); the card that opens from one stays readable.
  const className = blurredVision(view) ? [props.className, "blurred-vision"].filter(Boolean).join(" ") : props.className;
  if (!affordable(option)) {
    return (
      <DisabledActionButton view={view} blocked={option} className={className} hint={hint} switchProps={switchProps} radioProps={radioProps}>
        {children}
      </DisabledActionButton>
    );
  }
  return <EnabledActionButton {...props} className={className} />;
}

function EnabledActionButton({
  view,
  option,
  onAction,
  children,
  className,
  hint,
  singlePress,
  switchProps,
  radioProps,
}: {
  view: PlayerView;
  option: ActionOption;
  onAction: (action: Action) => void;
  children?: ReactNode;
  className?: string | undefined;
  hint?: string | undefined;
  singlePress?: boolean | undefined;
  switchProps?: { checked: boolean; label: string } | undefined;
  radioProps?: { checked: boolean } | undefined;
}) {
  const { onClick, armed } = useDoublePress(() => onAction(option.action), singlePress || SINGLE_PRESS_ACTIONS.has(option.action.type));
  const button = switchProps ? (
    <button
      type="button"
      role="switch"
      aria-checked={switchProps.checked}
      aria-label={switchProps.label}
      className={className}
      data-armed={armed ? "" : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  ) : radioProps ? (
    <button
      type="button"
      role="radio"
      aria-checked={radioProps.checked}
      className={className}
      data-armed={armed ? "" : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  ) : (
    <button type="button" className={className} data-armed={armed ? "" : undefined} onClick={onClick}>
      {children}
    </button>
  );
  const { i18n } = useTranslation();
  if (!hasDetails(view, option, hint, i18n.exists(`actionDescriptions.${option.action.type}`))) return button;
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} render={button} />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card status-card">
            <ActionDetails view={view} option={option} hint={hint} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The card under an action button: its description (once `actionDescriptions.<type>` has one), the hint its caller
 * passes, and for food what eating it does; then, below a rule so they aren't read as eating's effects, its odds of
 * making you dirty or hurting you, each only when it isn't zero. `above` is anything the caller shows first (a reason).
 */
function ActionDetails({ view, option, hint, above }: { view: PlayerView; option: ActionOption; hint?: string | undefined; above?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const key = `actionDescriptions.${option.action.type}`;
  const type = consumedType(view, option);
  const description = i18n.exists(key) ? t(key as never) : undefined;
  const dirt = Math.round(option.dirt * 100);
  const injury = Math.round(option.injury * 100);
  const risky = dirt > 0 || injury > 0;
  const body = above !== undefined || description !== undefined || hint !== undefined || type !== undefined;
  return (
    <>
      {above}
      {description !== undefined && <p>{description}</p>}
      {hint !== undefined && <p>{hint}</p>}
      {type !== undefined && <ConsumeEffects type={type} view={view} />}
      {risky && body && <hr className="action-risks-rule" />}
      {risky && (
        <ul className="consume-effects action-risks">
          {dirt > 0 && (
            <li>
              <img src={STATUS_ICONS["dirty"]} alt="" />
              <span>{t("actions.dirtChance", { percent: dirt })}</span>
            </li>
          )}
          {injury > 0 && (
            <li>
              <img src={HP_ICON} alt="" />
              <span>{t("actions.injuryChance", { percent: injury })}</span>
            </li>
          )}
        </ul>
      )}
    </>
  );
}

/** Whether `ActionDetails` would show anything for an enabled button, so one with nothing to say gets no card. */
function hasDetails(view: PlayerView, option: ActionOption, hint: string | undefined, hasDescription: boolean): boolean {
  return hasDescription || hint !== undefined || consumedType(view, option) !== undefined || option.dirt > 0 || option.injury > 0;
}

/** The type of the item a consume action eats, so its button can say what it does. */
function consumedType(view: PlayerView, option: ActionOption): string | undefined {
  const a = option.action;
  if (a.type !== "consume") return undefined;
  return [...view.inventory, ...view.roomItems].find((i) => i.id === a.item)?.type;
}

export function DisabledActionButton({
  view,
  blocked,
  children,
  className,
  hint,
  switchProps,
  radioProps,
}: {
  view: PlayerView;
  blocked: ActionOption;
  children?: ReactNode;
  className?: string;
  hint?: string;
  switchProps?: { checked: boolean; label: string } | undefined;
  radioProps?: { checked: boolean } | undefined;
}) {
  const { t } = useTranslation();
  const { cost, lacks } = blocked;
  const reason =
    lacks[0] === "preselection"
      ? t("actions.lacksPreselection")
      : lacks[0] === "debris"
      ? t("patrol.noDebris")
      : lacks[0] === "pasiphae"
      ? t("actions.lacksPasiphae")
      : lacks[0] === "reactor"
      ? t(blocked.action.type === "travel" ? "actions.lacksReactorTravel" : "actions.lacksReactorTurn")
      : lacks[0] === "arack"
      ? t("actions.lacksArack")
      : lacks[0] === "explored"
      ? t("actions.lacksExplored")
      : lacks[0] === "icarusLost"
      ? t("actions.lacksIcarusLost")
      : lacks[0] === "mushNotSelected"
      ? t("actions.lacksMushNotSelected")
      : lacks[0] === "listPrinted"
      ? t("actions.lacksListPrinted")
      : lacks[0] === "broken"
      ? t("actions.lacksBroken")
      : lacks[0] === "antisocial"
      ? t("actions.lacksAntisocial")
      : lacks[0] === "germaphobe"
      ? t("actions.lacksGermaphobe")
      : lacks[0] === "notYourSong"
      ? t("actions.lacksNotYourSong")
      : lacks[0] === "listenedToday"
      ? t("actions.lacksListenedToday")
      : lacks[0] === "fragments"
      ? t("actions.lacksFragments")
      : lacks[0] === "clean"
      ? t("actions.lacksClean")
      : lacks[0] === "capacity"
      ? t(
          blocked.action.type === "issue_mission"
            ? "actions.missionIssuedToday"
            : blocked.action.type === "set_bios"
              ? "actions.cpuPriorityChangedToday"
              : "actions.atCapacity",
        )
      : lacks[0] === "cooldown"
      ? t("actions.onCooldown", { count: blocked.cooldown ?? 1 })
      : lacks[0] === "space"
      ? t("actions.lacksSpace")
      : lacks.length > 1
      ? t("actions.lacksBoth", { needAp: cost.ap, needMp: cost.mp, haveAp: view.you.ap, haveMp: view.you.mp })
      : lacks[0] === "mp"
        ? t("actions.lacksMp", { need: cost.mp, have: view.you.mp })
        : t("actions.lacksAp", { need: cost.ap, have: view.you.ap });
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        className={className ? `action-disabled ${className}` : "action-disabled"}
        aria-disabled="true"
        render={
          switchProps ? (
            <button type="button" role="switch" aria-checked={switchProps.checked} aria-label={switchProps.label} />
          ) : radioProps ? (
            <button type="button" role="radio" aria-checked={radioProps.checked} />
          ) : (
            <button type="button" />
          )
        }
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card status-card">
            <ActionDetails view={view} option={blocked} hint={hint} above={<p>{reason}</p>} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
