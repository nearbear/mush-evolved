import type { ActionCost } from "@mush2/shared";
import { ACTION_ICON } from "../art/assets.ts";

/** Button content for an action: bold AP cost and the action icon (only when it costs AP), then the label. */
export function ActionLabel({ text, cost }: { text: string; cost: ActionCost }) {
  return (
    <span className="action-label">
      {cost.ap > 0 && (
        <>
          <strong>{cost.ap}</strong>
          <img src={ACTION_ICON} alt="" />
        </>
      )}
      {text}
    </span>
  );
}
