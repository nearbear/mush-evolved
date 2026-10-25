// The two live regions the game speaks through (see announce.ts), plus a button that repeats the
// last announcement. The button is the first Tab stop on the page and only shows while focused.

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { repeatLast, setMoreText, useAnnouncerLines, type Urgency } from "../announce.ts";

function Region({ urgency }: { urgency: Urgency }) {
  const lines = useAnnouncerLines(urgency);
  return (
    <div className="sr-only" data-announcer={urgency} role={urgency === "assertive" ? "alert" : "status"} aria-live={urgency} aria-atomic="false" aria-relevant="additions">
      {lines.map((l) => (
        <p key={l.id}>{l.text}</p>
      ))}
    </div>
  );
}

export function Announcer() {
  const { t } = useTranslation();
  useEffect(() => setMoreText((count) => t("announce.more", { count })), [t]);
  return (
    <>
      <button type="button" className="announce-repeat" onClick={repeatLast}>
        {t("announce.repeat")}
      </button>
      <Region urgency="polite" />
      <Region urgency="assertive" />
    </>
  );
}
