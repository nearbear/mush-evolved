// A turret's window (owner, 2026-10-24): this turret's charges and every hunter in range with its hp (`view.hunters`,
// sent only to the living in a turret room), each with a Shoot button when the view offers one (HunterList.tsx).

import type { Action, EquipmentView, PlayerView } from "@mush2/shared";
import { HunterList } from "./HunterList.tsx";

interface Props {
  terminal: EquipmentView;
  view: PlayerView;
  onAction: (action: Action) => void;
}

export function TurretPanel({ terminal, view, onAction }: Props) {
  const { turrets } = view.hunters;
  if (!turrets) return null;
  return (
    <HunterList
      view={view}
      charges={turrets[terminal.id] ?? 0}
      offer={(hunter) => view.actions.find(({ action: a }) => a.type === "turret_attack" && a.equipment === terminal.id && a.hunter === hunter)}
      onAction={onAction}
    />
  );
}
