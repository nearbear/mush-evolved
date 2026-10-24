// The asset attribution (CC BY-NC-SA) and the non-commercial promise: at the bottom of the
// lobby and of the Inspect panel, on both layouts.

import { Trans, useTranslation } from "react-i18next";

export function Credits({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <footer className={className ? `credits ${className}` : "credits"}>
      <Trans
        i18nKey="credits.text"
        components={{
          mush: <em />,
          archive: <a href="https://github.com/motion-twin/WebGamesArchives" />,
          license: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" />,
        }}
      />{" "}
      {t("credits.nonCommercial")}
    </footer>
  );
}
