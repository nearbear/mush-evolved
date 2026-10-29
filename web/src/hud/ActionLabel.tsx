import type { ActionCost, ActionVisibility } from "@mush2/shared";
import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ACTION_ICON, RESOURCE_ICONS, VISIBILITY_ICONS } from "../art/assets.ts";

const MIN_FONT_PX = 9;

/** Shrinks the label one pixel at a time, down to MIN_FONT_PX, until it fits inside its button's padding box. */
function useFitText(content: string) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    // Refit whenever the label's content changes.
    void content;
    const label = ref.current;
    const button = label?.parentElement;
    if (!label || !button) return;
    const fit = () => {
      label.style.fontSize = "";
      const style = getComputedStyle(button);
      const room = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      let size = parseFloat(getComputedStyle(label).fontSize);
      while (size > MIN_FONT_PX && label.scrollWidth > room) {
        size -= 1;
        label.style.fontSize = `${Math.max(size, MIN_FONT_PX)}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(button);
    return () => observer.disconnect();
  }, [content]);
  return ref;
}

/**
 * Button content for an action: the icon of the resource that pays for it in place of AP (`cost.paidBy`, a Computer
 * point, a care point...), bold AP cost and the action icon (only when it costs AP), then the label,
 * then the chance of success in parentheses when the action can fail, then an icon when it is private, secret or covert.
 */
export function ActionLabel({
  text,
  cost,
  chance = 1,
  visibility = "public",
}: {
  text: string;
  cost: ActionCost;
  chance?: number;
  visibility?: ActionVisibility;
}) {
  const { t } = useTranslation();
  const ref = useFitText(`${text}|${cost.ap}|${cost.paidBy}|${chance}|${visibility}`);
  return (
    <span className="action-label" ref={ref}>
      {cost.paidBy && <img src={RESOURCE_ICONS[cost.paidBy]} alt="" />}
      {cost.ap > 0 && (
        <>
          <strong aria-hidden="true">{cost.ap}</strong>
          <img src={ACTION_ICON} alt="" />
        </>
      )}
      {text}
      {cost.ap > 0 && <span className="sr-only">{`, ${cost.ap} ${t("stat.ap")}`}</span>}
      {cost.paidBy && <span className="sr-only">{t("actions.paidBy", { resource: t(`resources.${cost.paidBy}.name`) })}</span>}
      {chance < 1 && <span className="action-chance">{t("actions.chance", { percent: Math.round(chance * 100) })}</span>}
      {visibility !== "public" && <img src={VISIBILITY_ICONS[visibility]} alt={t(`actions.visibility.${visibility}`)} />}
    </span>
  );
}
