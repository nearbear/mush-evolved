// Shown until the Mush are chosen (view.preselection). Tap or hover for what pre-selection means.

import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";

export function PreselectionTag() {
  const { t } = useTranslation();
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="preselection-tag">
        {t("topBar.preselection")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card">
            <strong>{t("topBar.preselection")}</strong>
            <p>{t("topBar.preselectionAbout")}</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
