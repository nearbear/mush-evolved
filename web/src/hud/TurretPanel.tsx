// A turret's window (owner, 2026-10-24): this turret's charges and every hunter in range with its hp (`view.hunters`,
// sent only to the living in a turret room), each with a Shoot button when the view offers one. You always pick the target.

import type { Action, EquipmentView, PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import "./settings.css";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function TurretPanel({ terminal, view, onAction }: Props) {
  const { t } = useTranslation();
  const { list, turrets } = view.hunters;
  if (!list || !turrets) return null;
  return (
    <div className="research-list" role="group" aria-label={t("turret.label")}>
      <p>{t("turret.charges", { charges: turrets[terminal.id] ?? 0 })}</p>
      {list.length === 0 && <p>{t("turret.none")}</p>}
      {list.map((hunter, i) => {
        const offer = view.actions.find(({ action: a }) => a.type === "turret_attack" && a.equipment === terminal.id && a.hunter === hunter.id);
        const name = t("turret.hunter", { index: i + 1 });
        return (
          <section key={hunter.id} className="research-item" aria-label={name}>
            <div className="research-body">
              <strong>{name}</strong>
              <span>{t("turret.hp", { hp: hunter.hp })}</span>
            </div>
            {offer && (
              <ActionButton view={view} option={offer} onAction={onAction}>
                <ActionLabel text={t("actions.turretAttack")} cost={offer.cost} chance={offer.chance} />
              </ActionButton>
            )}
          </section>
        );
      })}
    </div>
  );
}
