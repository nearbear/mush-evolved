// The battle panel's hunter list (owner, 2026-10-24 and 2026-10-28): every hunter in range with its hp (`view.hunters.list`,
// sent only to the living at a turret or flying a ship), each with a Shoot button when the view offers `offer(hunter)`.
// Shared by the turret window (TurretPanel.tsx) and the patrol-ship cockpit (PatrolCockpit.tsx). You always pick the target.

import type { Action, ActionOption, PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
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
  return (
    <div className="research-list" role="group" aria-label={t("turret.label")}>
      {charges !== null && <p>{t("turret.charges", { charges })}</p>}
      {list.length === 0 && <p>{t("turret.none")}</p>}
      {list.map((hunter, i) => {
        const option = offer(hunter.id);
        const name = t("turret.hunter", { index: i + 1 });
        return (
          <section key={hunter.id} className="research-item" aria-label={name}>
            <div className="research-body">
              <strong>{name}</strong>
              <span>{t("turret.hp", { hp: hunter.hp })}</span>
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
  );
}
