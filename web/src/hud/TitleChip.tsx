import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import type { TitleView } from "@mush2/shared";
import { TITLE_ICONS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";

/** A title's icon and who holds it (the icon alone, muted, while vacant); its line of succession (public) opens in a popover on hover, focus, or tap. */
export function TitleChip({ entry: title }: { entry: TitleView }) {
  const { t } = useTranslation();
  const names = useNames();
  const name = names.title(title.id);
  const holder = title.holder === null ? null : names.characterGiven(title.holder);
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className={holder === null ? "resource vacant" : "resource"}
        aria-label={holder === null ? t("titles.holderVacant", { title: name }) : t("titles.holder", { title: name, name: holder })}
      >
        <img src={TITLE_ICONS[title.id]} alt="" />
        {/* Vacant: the icon alone, muted (the name is in the label and the popover). */}
        {holder}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card title-card">
            <strong>{name}</strong>
            <p>{t("titles.line")}</p>
            <ol>
              {title.line.map((character) => (
                <li key={character} className={character === title.holder ? "holder" : undefined}>
                  {names.characterGiven(character)}
                </li>
              ))}
            </ol>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
