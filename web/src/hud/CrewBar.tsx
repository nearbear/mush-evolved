// The crew bar (owner, 2026-11-21): one of the original's small figures per seat, tightly packed, in the desktop top
// bar's ship zone (phones get the `compact` button in the top strip instead). Grouped: the living, then (for Mush only) the living Mush, the empty
// seats as cryo sleepers, the dead, then (for Mush only) the dead Mush. Who is Mush comes only from the view's `mush`
// flag, which viewFor sends to Mush alone, so a human sees every living crewmate as alive and every corpse as dead.
// Hover, focus or tap opens a popover with each group's count and who is in it: each member's standing sprite with
// their given name underneath. Phones get `compact` in the top strip: one living figure and how many are alive (human or
// Mush, not the cryo sleepers), opening the same popover.

import { Popover } from "@base-ui/react/popover";
import type { CharacterId, PlayerView, Role } from "@mush2/shared";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { CREW_ICONS, standingSprite } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";

export type CrewGroup = keyof typeof CREW_ICONS;
const GROUPS: readonly CrewGroup[] = ["alive", "mush", "cryo", "dead", "deadMush"];

export interface CrewProps {
  players: PlayerView["players"];
  youCharacter: CharacterId;
  youRole: Role;
  youAlive: boolean;
  seats: number;
}

/** Each group's characters (crew order, you first) and how many seats are empty. Pure: the view says who is Mush. */
export function crewGroups({ players, youCharacter, youRole, youAlive, seats }: CrewProps): { characters: Record<CrewGroup, CharacterId[]>; cryo: number } {
  const characters: Record<CrewGroup, CharacterId[]> = { alive: [], mush: [], cryo: [], dead: [], deadMush: [] };
  const place = (character: CharacterId, alive: boolean, mush: boolean) =>
    characters[alive ? (mush ? "mush" : "alive") : mush ? "deadMush" : "dead"].push(character);
  place(youCharacter, youAlive, youRole === "mush");
  for (const p of players) place(p.character, p.alive, p.mush === true);
  return { characters, cryo: Math.max(0, seats - players.length - 1) };
}

export const CrewBar = memo(function CrewBar({ compact = false, ...props }: CrewProps & { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const { characters, cryo } = crewGroups(props);
  const count = (group: CrewGroup) => (group === "cryo" ? cryo : characters[group].length);
  const shown = GROUPS.filter((g) => count(g) > 0);
  const living = characters.alive.length + characters.mush.length;
  const summary = new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(shown.map((g) => t(`crew.count.${g}`, { count: count(g) })));
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className={compact ? "crew-bar crew-button" : "crew-bar"}
        aria-label={t("crew.label", { summary })}
      >
        {compact ? (
          <>
            <img src={CREW_ICONS.alive} alt="" width={7} height={15} />
            <span className="crew-button-count">{living}</span>
          </>
        ) : (
          shown.map((g) => Array.from({ length: count(g) }, (_, i) => <img key={`${g}${i}`} src={CREW_ICONS[g]} alt="" width={7} height={15} />))
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} {...(compact ? { align: "end" as const } : {})}>
          <Popover.Popup className="tooltip resource-card crew-card">
            <strong>{t("crew.title")}</strong>
            {shown.map((g) => (
              <section key={g} className="crew-group">
                <h3 className="title-section-heading">
                  <img src={CREW_ICONS[g]} alt="" />
                  <span>{t(`crew.count.${g}`, { count: count(g) })}</span>
                </h3>
                {g !== "cryo" && (
                  <ul className="crew-figures">
                    {characters[g].map((c) => (
                      <li key={c}>
                        <span className="crew-figure" style={standingSprite(c)} aria-hidden="true" />
                        <span className="crew-figure-name">{names.characterGiven(c)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
});

/** The crew bar's props from a view. */
export const crewProps = (view: PlayerView): CrewProps => ({
  players: view.players,
  youCharacter: view.you.character,
  youRole: view.you.role,
  youAlive: view.you.alive,
  seats: view.config.seats,
});
