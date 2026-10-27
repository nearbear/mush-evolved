// The asset attribution (CC BY-NC-SA) and the non-commercial promise: a footer at the bottom of the lobby, and in
// the game at the top of the settings dialog (`as="p"`), under its header, where every player looks sooner or later.

import { Trans, useTranslation } from "react-i18next";

export function Credits({ className, as: Tag = "footer" }: { className?: string; as?: "footer" | "p" }) {
  const { t } = useTranslation();
  return (
    <Tag className={className ? `credits ${className}` : "credits"}>
      <Trans
        i18nKey="credits.text"
        components={{
          mush: <em />,
          archive: <a href="https://github.com/motion-twin/WebGamesArchives" />,
          license: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" />,
        }}
      />{" "}
      {t("credits.nonCommercial")}
    </Tag>
  );
}
