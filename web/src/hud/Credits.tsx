// The asset attribution (CC BY-NC-SA), at the bottom of the Inspect panel on both layouts.

import { Trans } from "react-i18next";

export function Credits() {
  return (
    <footer className="credits">
      <Trans
        i18nKey="credits.text"
        components={{
          mush: <em />,
          archive: <a href="https://github.com/motion-twin/WebGamesArchives" />,
          license: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" />,
        }}
      />
    </footer>
  );
}
