import { memo } from "react";
import { useTranslation } from "react-i18next";
import { PROJECT_COMPLETE, PROJECT_IDS, type PlayerView } from "@mush2/shared";
import { PROJECT_CARDS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { EntryTip } from "./TerminalDialog.tsx";

/**
 * The NERON projects feature's tracker: a sideways-scrolling strip of every project card, completed ones first and in
 * colour, the rest greyed out. Progress is known only for currently offered projects while at NERON's core
 * (`view.relay.projects` is filled for those); elsewhere the view has only completed projects, so the rest read
 * "not complete".
 */
export const ProjectTracker = memo(
  function ProjectTracker({ view }: { view: PlayerView }) {
    const { t } = useTranslation();
    const names = useNames();
    const done = (id: string) => (view.projects[id] ?? 0) >= PROJECT_COMPLETE;
    const ids = [...PROJECT_IDS.filter(done), ...PROJECT_IDS.filter((id) => !done(id))];
    return (
      <ul className="tracker research-tracker" aria-label={t("itrackie.projectTracker")}>
        {ids.map((id) => {
          const complete = done(id);
          const card = PROJECT_CARDS[id.toLowerCase()];
          const offered = view.relay.projects[id] !== undefined;
          const status = complete ? t("research.done") : offered ? t("research.progress", { percent: view.projects[id] ?? 0 }) : t("research.notDone");
          const label = names.project(id);
          const desc = t(`projects.desc.${id}` as never, { defaultValue: "" }) || undefined;
          return (
            <li key={id} className={complete ? "research-tracker-card" : "research-tracker-card pending"} aria-label={`${label}: ${status}`}>
              <EntryTip name={label} desc={desc} trigger={<div className="research-tracker-card-body" />}>
                {card && <img src={card} alt="" />}
                <span aria-hidden={desc ? undefined : true}>{label}</span>
              </EntryTip>
            </li>
          );
        })}
      </ul>
    );
  },
  (a, b) => a.view.projects === b.view.projects && a.view.relay.projects === b.view.relay.projects,
);
