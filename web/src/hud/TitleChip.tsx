import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import type { TitleView } from "@mush2/shared";
import { TITLE_ICONS } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";

/** A title's line of succession: the holder in bold, anyone who lost it struck through, anyone without it muted. */
export function TitleSuccession({ title, preselection = false }: { title: TitleView; preselection?: boolean }) {
  const names = useNames();
  const holderIndex = title.holder !== null ? title.line.indexOf(title.holder) : -1;
  return (
    <ol>
      {title.line.map((character, index) => {
        const isHolder = character === title.holder;
        const isLost = !isHolder && (holderIndex !== -1 ? index < holderIndex : title.holder === null && !preselection);
        const className = isHolder ? "holder" : isLost ? "lost" : undefined;
        return (
          <li key={character} className={className}>
            {names.characterGiven(character)}
          </li>
        );
      })}
    </ol>
  );
}

/** Desktop top bar: one commander-icon button opening a single popover with every title and its line of succession. */
export function TitlesChip({ titles, preselection = false }: { titles: TitleView[]; preselection?: boolean }) {
  const { t } = useTranslation();
  const names = useNames();
  const allVacant = titles.every((title) => title.holder === null);
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        className={allVacant ? "ship-titles-button vacant" : "ship-titles-button"}
        aria-label={t("titles.label")}
      >
        <img src={TITLE_ICONS.commander} alt="" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card title-card titles-card">
            <p className="titles-line-heading">{t("titles.line")}</p>
            <div className="titles-grid">
              {titles.map((title) => (
                <section key={title.id} className="title-section">
                  <h3 className="title-section-heading">
                    <img src={TITLE_ICONS[title.id]} alt="" />
                    <span>{names.title(title.id)}</span>
                  </h3>
                  <TitleSuccession title={title} preselection={preselection} />
                </section>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A title's icon and who holds it (the icon alone, muted, while vacant); its line of succession (public) opens in a popover on hover, focus, or tap. */
export function TitleChip({ entry: title, preselection = false }: { entry: TitleView; preselection?: boolean }) {
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
            <TitleSuccession title={title} preselection={preselection} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
