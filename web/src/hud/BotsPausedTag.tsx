// Shown while the AI crew is waiting on its model, so the cycle (which waits for them) is paused (#114). Tap or hover
// for why.

import { Popover } from "@base-ui/react/popover";
import type { BotPause } from "@mush2/shared";
import { useTranslation } from "react-i18next";

export function BotsPausedTag({ pause }: { pause: BotPause }) {
  const { t } = useTranslation();
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="preselection-tag">
        {t("topBar.botsPaused")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card">
            <strong>{t("topBar.botsPaused")}</strong>
            <p>{t(`topBar.botsPausedAbout.${pause}`)}</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
