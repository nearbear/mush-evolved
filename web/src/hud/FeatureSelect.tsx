// The Features drop-down. A native <select> can't show images, so this is a
// Base UI Select whose trigger and options carry the feature's icon.

import { useTranslation } from "react-i18next";
import { Select } from "@base-ui/react/select";
import { FEATURE_CHANNELS, type FeatureChannel } from "@mush2/shared";
import { TAB_ICONS } from "../art/assets.ts";
import { UnreadCount } from "./UnreadChip.tsx";

const FEATURE_ICONS: Record<FeatureChannel, string> = {
  botany: TAB_ICONS.botany,
  research: TAB_ICONS.research,
  inventory: TAB_ICONS.inventory,
  space_battle: TAB_ICONS.spaceCombat,
  comms: TAB_ICONS.comms,
  pilgred: TAB_ICONS.pilgred,
  neron: TAB_ICONS.neronProjects,
  astrophysics: TAB_ICONS.astrophysics,
  expeditions: TAB_ICONS.expeditions,
};

export function FeatureSelect({
  value,
  onChange,
  unread = {},
}: {
  value: FeatureChannel;
  onChange: (feature: FeatureChannel) => void;
  /** Unread per feature, its shared entries included (#400). */
  unread?: Partial<Record<FeatureChannel, number>>;
}) {
  const { t } = useTranslation();
  // The trigger counts the other features: the one picked is on screen, with its own chips.
  const elsewhere = FEATURE_CHANNELS.reduce((sum, f) => (f === value ? sum : sum + (unread[f] ?? 0)), 0);
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as FeatureChannel)}>
      <Select.Trigger className="feature-select feature-select-trigger" aria-label={elsewhere > 0 ? t("itrackie.unread.featureLabel", { name: t("itrackie.featureLabel"), count: elsewhere }) : t("itrackie.featureLabel")}>
        <img className="tab-icon" src={FEATURE_ICONS[value]} alt="" />
        <span className="feature-select-name">{t(`itrackie.features.${value}`)}</span>
        {elsewhere > 0 && (
          <span className="unread-chip" aria-hidden="true">
            {elsewhere > 99 ? "99+" : elsewhere}
          </span>
        )}
        <Select.Icon aria-hidden="true">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} alignItemWithTrigger={false} className="feature-select-positioner">
          <Select.Popup className="feature-select-popup">
            <Select.List>
              {FEATURE_CHANNELS.map((f) => (
                <Select.Item key={f} value={f} className="feature-select-item">
                  <img className="tab-icon" src={FEATURE_ICONS[f]} alt="" />
                  <Select.ItemText>{t(`itrackie.features.${f}`)}</Select.ItemText>
                  <UnreadCount count={unread[f] ?? 0} />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
