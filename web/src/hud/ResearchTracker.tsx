import { useTranslation } from "react-i18next";
import { RESEARCH_COMPLETE, RESEARCH_IDS, type PlayerView } from "@mush2/shared";
import { RESEARCH_CARDS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";

/**
 * The Research feature's tracker: a sideways-scrolling strip of every research card, completed ones first and in
 * colour, the rest greyed out. Progress is known only in the lab (`view.relay.research` is filled there); elsewhere
 * the view has only completed researches, so the others read "not complete".
 */
export function ResearchTracker({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const names = useNames();
  const done = (id: string) => (view.research[id] ?? 0) >= RESEARCH_COMPLETE;
  const ids = [...RESEARCH_IDS.filter(done), ...RESEARCH_IDS.filter((id) => !done(id))];
  return (
    <ul className="tracker research-tracker" aria-label={t("itrackie.researchTracker")}>
      {ids.map((id) => {
        const complete = done(id);
        const card = RESEARCH_CARDS[id.toLowerCase()];
        const inLab = view.relay.research[id] !== undefined;
        const status = complete ? t("research.done") : inLab ? t("research.progress", { percent: view.research[id] ?? 0 }) : t("research.notDone");
        return (
          <li key={id} className={complete ? "research-tracker-card" : "research-tracker-card pending"} aria-label={`${names.research(id)}: ${status}`}>
            {card && <img src={card} alt="" />}
            <span aria-hidden="true">{names.research(id)}</span>
          </li>
        );
      })}
    </ul>
  );
}
