// What the room view shows while you fly a patrol ship (docs/plans/patrol.md, phase 2; owner, 2026-10-24: a plain panel
// for now, art later): the ship, its armor (`view.patrolShip`), and its cockpit, which you select like any equipment,
// so its actions (Land) are in the Inspect panel and, on a phone, the peek bar. Below it, the battle panel (phase 3;
// owner, 2026-10-28): the hunters with their hp and the ship's charges, with a Shoot button on each (a patrol ship
// only; the Pasiphae can't shoot, so it lists the hunters without charges or buttons). The debris count (phase 5; owner,
// 2026-10-28) says whether Collect scrap, on the command, is worth a try.

import type { Action, PlayerView, Target } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { HunterList } from "./HunterList.tsx";
import { sameTarget } from "./targets.ts";

interface Props {
  view: PlayerView;
  ship: NonNullable<PlayerView["patrolShip"]>;
  selected: Target;
  onSelect: (target: Target) => void;
  onAction: (action: Action) => void;
}

export function PatrolCockpit({ view, ship, selected, onSelect, onAction }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <section className="iso-room patrol-cockpit" aria-label={names.room(ship.id)}>
      <h2>{t("patrol.flying", { ship: names.room(ship.id) })}</h2>
      <p>{t("patrol.armor", { armor: ship.armor, max: ship.maxArmor })}</p>
      <p>{ship.debris > 0 ? t("patrol.debris", { count: ship.debris }) : t("patrol.noDebris")}</p>
      {view.roomEquipment.map((e) => {
        const target: Target = { kind: "equipment", id: e.id };
        return (
          <button key={e.id} type="button" className="big" aria-pressed={sameTarget(selected, target)} onClick={() => onSelect(target)}>
            {names.equipment(e.type)}
          </button>
        );
      })}
      <HunterList
        view={view}
        charges={ship.charges}
        offer={(hunter) => view.actions.find(({ action: a }) => a.type === "patrol_attack" && a.hunter === hunter)}
        onAction={onAction}
      />
    </section>
  );
}
