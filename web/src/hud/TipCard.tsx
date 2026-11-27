// One tip at a time over the room (#351): what the shared catalog says applies (`tipsFor`), minus what the viewer
// dismissed or muted (`web/src/tips.ts`), with the client's own `doublePress` tip (`web/src/pressMode.ts`) first when it
// applies. Advice only: it reads the view and sends nothing to the server.

import { ONCE_TIPS, tipsFor, type PlayerView, type Tip } from "@mush2/shared";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { announce, useVerbosity } from "../announce.ts";
import { useNames } from "../i18n/names.ts";
import { useDoublePressTip } from "../pressMode.ts";
import { dismissTip, muteTip, shownTip, syncTips, useTipPrefs } from "../tips.ts";
import "./tips.css";

export function TipCard({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const names = useNames();
  const prefs = useTipPrefs();
  const verbosity = useVerbosity();
  const doublePress = useDoublePressTip();
  const tips = useMemo(() => (doublePress ? [{ id: "doublePress" as const }, ...tipsFor(view)] : tipsFor(view)), [view, doublePress]);
  const tip = shownTip(tips, prefs);
  const ids = tips.map((x) => x.id).join(",");

  // A snoozed tip whose situation ended may show again next time.
  useEffect(() => syncTips(ids ? (ids.split(",") as Tip["id"][]) : []), [ids]);

  /** The tip's text, with the numbers some of them need from the view. */
  function body(tip: Tip): string {
    if (tip.id === "noMp") return t("tips.noMp.body", { ap: view.movement.apPerConversion, mp: view.movement.mpPerConversion });
    if (tip.id === "welcome") return t(tip.endCycle ? "tips.welcome.bodyEndCycle" : "tips.welcome.bodyClock");
    if (tip.id === "hurt") return t("tips.hurt.body", { room: names.room(tip.room ?? "SICK_BAY") });
    return t(`tips.${tip.id}.body`);
  }

  const spoken = tip ? `${t(`tips.${tip.id}.title`)}. ${body(tip)}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tip?.id` is the trigger: a tip is announced when it first shows, not each time its text or the view changes.
  useEffect(() => {
    if (spoken && verbosity === "all") announce(spoken);
  }, [tip?.id]);

  if (!tip) return null;

  const where =
    tip.room === undefined ? null : tip.doors === 0 ? t("tips.where.here") : t("tips.where.there", { room: names.room(tip.room), count: tip.doors });

  return (
    <aside className="tip-card" aria-label={t("tips.label")}>
      <div className="tip-head">
        <strong>{t(`tips.${tip.id}.title`)}</strong>
        <button type="button" className="tip-close" aria-label={t("tips.dismiss")} onClick={() => dismissTip(tip.id)} />
      </div>
      <p>{body(tip)}</p>
      {where && <p className="tip-where">{where}</p>}
      {!ONCE_TIPS.has(tip.id) && (
        <button type="button" className="tip-mute" onClick={() => muteTip(tip.id)}>
          {t("tips.mute")}
        </button>
      )}
    </aside>
  );
}
