// What the room view shows while you fly a patrol ship (docs/patrol-plan.md, phase 2; owner, 2026-10-24: a plain panel
// for now, art later): the ship, its armor (`view.patrolShip`), and its cockpit, which you select like any equipment,
// so its actions (Land) are in the Inspect panel and, on a phone, the peek bar.

import type { PlayerView, Target } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { sameTarget } from "./targets.ts";

interface Props {
  view: PlayerView;
  ship: NonNullable<PlayerView["patrolShip"]>;
  selected: Target;
  onSelect: (target: Target) => void;
}

export function PatrolCockpit({ view, ship, selected, onSelect }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <section className="iso-room patrol-cockpit" aria-label={names.room(ship.id)}>
      <h2>{t("patrol.flying", { ship: names.room(ship.id) })}</h2>
      <p>{t("patrol.armor", { armor: ship.armor, max: ship.maxArmor })}</p>
      {view.roomEquipment.map((e) => {
        const target: Target = { kind: "equipment", id: e.id };
        return (
          <button key={e.id} type="button" className="big" aria-pressed={sameTarget(selected, target)} onClick={() => onSelect(target)}>
            {names.equipment(e.type)}
          </button>
        );
      })}
    </section>
  );
}
