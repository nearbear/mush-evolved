import type { ActionCost, ActionVisibility } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { ACTION_ICON, VISIBILITY_ICONS } from "../art/assets.ts";

/**
 * Button content for an action: bold AP cost and the action icon (only when it costs AP), then the label,
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
  return (
    <span className="action-label">
      {cost.ap > 0 && (
        <>
          <strong>{cost.ap}</strong>
          <img src={ACTION_ICON} alt="" />
        </>
      )}
      {text}
      {chance < 1 && <span className="action-chance">{t("actions.chance", { percent: Math.round(chance * 100) })}</span>}
      {visibility !== "public" && <img src={VISIBILITY_ICONS[visibility]} alt={t(`actions.visibility.${visibility}`)} />}
    </span>
  );
}
