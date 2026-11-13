// The battle panel's hunter list (owner, 2026-10-24 and 2026-10-28): every hunter in range with its hp (`view.hunters.list`,
// sent only to the living at a turret or flying a ship), each with a Shoot button when the view offers `offer(hunter)`.
// Used by the turret window (TurretPanel.tsx); the patrol-ship cockpit plots its hunters in space instead (PatrolCockpit.tsx).
// You always pick the target.
// Each row shows its kind's small battle sprite from the original's fx sheet (`HUNTER_SPRITES_SMALL`, all 36x26 so the
// rows stay even), drawn at 1x, and is named by kind and its number among that kind ("Arack 2"); an asteroid adds its
// impact countdown. The rows scroll in their own area so a big wave doesn't push the cockpit's other controls off the panel.

import { ScrollArea } from "@base-ui/react/scroll-area";
import type { Action, ActionOption, PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { HUNTER_SPRITES_SMALL } from "../art/assets.ts";
import { FxSprite } from "./FxSprite.tsx";
import "./settings.css";

interface Props {
  view: PlayerView;
  /** One line above the list (the turret's or the ship's charges). */
  charges: number | null;
  offer: (hunter: string) => ActionOption | undefined;
  onAction: (action: Action) => void;
}

export function HunterList({ view, charges, offer, onAction }: Props) {
  const { t } = useTranslation();
  const { list } = view.hunters;
  if (!list) return null;
  const seen: Record<string, number> = {};
  return (
    <div className="research-list" role="group" aria-label={t("turret.label")}>
      {charges !== null && <p>{t("turret.charges", { charges })}</p>}
      {list.length === 0 && <p>{t("turret.none")}</p>}
      {list.length > 0 && (
        <ScrollArea.Root className="hunter-scroll">
          <ScrollArea.Viewport className="hunter-viewport">
            <div className="research-list">
              {list.map((hunter) => {
                const option = offer(hunter.id);
                const index = (seen[hunter.type] = (seen[hunter.type] ?? 0) + 1);
                const name = t("turret.hunter", { kind: t(`turret.kinds.${hunter.type}`), index });
                return (
                  <section key={hunter.id} className="research-item hunter-item" aria-label={name}>
                    <FxSprite slice={HUNTER_SPRITES_SMALL[hunter.type]} className="hunter-sprite" />
                    <div className="research-body">
                      <strong>{name}</strong>
                      <span>{t("turret.hp", { hp: hunter.hp })}</span>
                      {hunter.countdown !== null && <span>{t("turret.countdown", { count: hunter.countdown })}</span>}
                    </div>
                    {option && (
                      <ActionButton view={view} option={option} onAction={onAction}>
                        <ActionLabel text={t("actions.turretAttack")} cost={option.cost} chance={option.chance} />
                      </ActionButton>
                    )}
                  </section>
                );
              })}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className="scroll-bar" orientation="vertical">
            <ScrollArea.Thumb className="scroll-thumb" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      )}
    </div>
  );
}
