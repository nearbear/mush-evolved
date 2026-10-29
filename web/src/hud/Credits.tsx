// The asset attribution (CC BY-NC-SA), the non-commercial promise and (once the repo is public) the AGPL source link: a footer at the bottom of the lobby, and in
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
      {/* The AGPL source link (credits.source), off while the repo is private: it would 404. Restore it, with the {" "}
          before it, when the repo goes public.
      <Trans i18nKey="credits.source" components={{ source: <a href="https://github.com/nearbear/mush2" />, agpl: <a href="https://www.gnu.org/licenses/agpl-3.0.html" /> }} />
      */}
    </Tag>
  );
}
