// Your action under way and the ones waiting behind it, with Clear queue. Shown over the room view in both layouts
// while you have any. The order and contents come from the view; nothing is decided here.

import { useTranslation } from "react-i18next";
import type { PlayerView } from "@mush2/shared";
import { useNames } from "../i18n/names.ts";
import { describeAction } from "./actionText.ts";

export function ActionQueue({ view, onClear }: { view: PlayerView; onClear: () => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const { current, queue } = view.you;
  const say = (a: PlayerView["you"]["queue"][number]) => describeAction(view, names, t("stat.ap"), a);
  if (!current && queue.length === 0) return null;
  return (
    <section className="action-queue" aria-label={t("queue.label")}>
      <ol>
        {current && <li className="current">{say(current.action)}</li>}
        {/* Queued actions have no id, and the same one can wait twice, so their place is the key. */}
        {queue.map((a, i) => (
          <li key={i}>{say(a)}</li>
        ))}
      </ol>
      <button type="button" onClick={onClear}>
        {t("queue.clear")}
      </button>
    </section>
  );
}
