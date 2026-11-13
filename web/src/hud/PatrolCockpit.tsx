// What the room view shows while you fly a patrol ship (docs/plans/patrol.md; owner, 2026-11-10): a space scene. Your
// ship, drawn with its docked sprite, sits in the upper right with its nose to the lower left; the star field streams
// the other way to show the speed. The hunter you aim at is drawn large just ahead of the ship's nose, inside a reticle;
// the rest wait in the lower left as one small sprite per kind with a count (so 99 hunters take the room of one), and
// pressing a kind's sprite aims at the next hunter of that kind. An asteroid's readout adds its impact countdown. Both your ship and the targeted hunter show their name, a stack of shield icons and
// their hp underneath the sprite. The ship and the hunters each weave on their own beat, the ship a moment behind, so it
// reads as a chase. The bar under the scene (a TechnoBox) has the ship's charges at the top (the number centred, the charges alternating left and right of it), Shoot flanked
// by the two target-cycling arrow buttons (a patrol ship only; the Pasiphae can't shoot), and the ship's other actions
// (Land, Collect scrap: whatever the view offers on its command, less Examine). Collect scrap's tooltip says how much
// debris floats nearby (the view leaves the count out while a patrol ship can't collect); when the rules refuse it (no debris, or a patrol ship while the Pasiphae exists) it shows disabled with why.

import { HUNTER_TYPES, actionVisibility, patrolShip, type Action, type HunterView, type PlayerView, type ShipLayout } from "@mush2/shared";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { FX_CHARGE, FX_SHIELD, HUNTER_SPRITES, HUNTER_SPRITES_SMALL } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { atlasUrl } from "../iso/shipLayout.ts";
import { ActionButton } from "./ActionButton.tsx";
import { ActionLabel } from "./ActionLabel.tsx";
import { FxSprite } from "./FxSprite.tsx";
import { NO_FORMATION, aimedSlot, hunterIn, nextOfKind, stepAim, track } from "./hunterSlots.ts";
import { spaceSky } from "./spaceSky.ts";
import { optionsOn } from "./targets.ts";
import { TechnoBox } from "./TechnoBox.tsx";

interface Props {
  view: PlayerView;
  ship: NonNullable<PlayerView["patrolShip"]>;
  /** The ship's art, for the patrol ship's sprite; none is drawn until it loads. */
  layout: ShipLayout | undefined;
  onAction: (action: Action) => void;
}

const NO_HUNTERS: NonNullable<PlayerView["hunters"]["list"]> = [];
/** The aimed plain hunter is drawn at twice its size (whole pixels, so it stays crisp); the other kinds' sprites are
    already 66-84px, so they stay at 1x. */
const aimScale = (type: HunterView["type"]): number => (type === "hunter" ? 2 : 1);
const aimSize = (type: HunterView["type"]): CSSProperties => {
  const [, , w, h] = HUNTER_SPRITES[type];
  return { width: w * aimScale(type), height: h * aimScale(type) };
};

export function PatrolCockpit({ view, ship, layout, onAction }: Props) {
  const { t } = useTranslation();
  const names = useNames();
  const list = view.hunters.list ?? NO_HUNTERS;

  // Derived state, adjusted while rendering: `track` hands back the same object unless the hunters changed.
  const [kept, setKept] = useState(NO_FORMATION);
  const formation = track(kept, list);
  if (formation !== kept) setKept(formation);

  const [aim, setAim] = useState(0);
  const slot = aimedSlot(formation, aim);
  const targetId = hunterIn(formation, slot);
  const target = list.find((h) => h.id === targetId);
  const shoot = target && view.actions.find(({ action: a }) => a.type === "patrol_attack" && a.hunter === target.id);
  const shipOptions = view.roomEquipment
    .flatMap((e) => optionsOn(view, { kind: "equipment", id: e.id }))
    .filter((o) => o.action.type !== "patrol_attack" && o.action.type !== "examine");

  // The hit flash plays only for hits landed while the hunter is the target: the count it had when you aimed at it is
  // the baseline, so stepping to a hunter someone else already hit does not flash.
  const hits = targetId === undefined ? 0 : (formation.hits[targetId] ?? 0);
  const [aimedAt, setAimedAt] = useState({ id: targetId, hits });
  if (aimedAt.id !== targetId) setAimedAt({ id: targetId, hits });
  const flash = aimedAt.id === targetId && hits > aimedAt.hits;

  const step = (dir: -1 | 1) => setAim(stepAim(formation, aim, dir));
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    step(dir);
  };

  const [sky] = useState(spaceSky);
  // The pack: how many of each kind are not the target, in `HUNTER_TYPES` order.
  const pack = HUNTER_TYPES.map((type) => ({ type, count: list.filter((h) => h.type === type && h !== target).length })).filter((k) => k.count > 0);

  return (
    <section
      className="iso-room patrol-cockpit"
      aria-label={t("patrol.flying", { ship: names.room(ship.id) })}
      style={sky ? ({ "--sky": `url(${sky.sky})`, "--stars": `url(${sky.stars})` } as CSSProperties) : undefined}
    >
      <div className="space-sky" aria-hidden="true" />
      <div className="space-sky space-stars" aria-hidden="true" />
      <div className="space-scene">
        <div className="space-ship">
          <span className="space-sway">
            <ShipSprite layout={layout} ship={ship.id} />
          </span>
          <CraftReadout name={names.room(ship.id)} hp={ship.armor} />
        </div>
        {target && slot !== undefined && (
          <div className="space-aim" aria-live="polite">
            <div className="space-sway" aria-hidden="true">
              <div className="space-reticle">
                <div style={aimSize(target.type)}>
                  <FxSprite
                    key={`${target.id}:${hits}`}
                    slice={HUNTER_SPRITES[target.type]}
                    className={[aimScale(target.type) === 2 && "x2", flash && "hit"].filter(Boolean).join(" ") || undefined}
                  />
                </div>
              </div>
            </div>
            <CraftReadout name={t("turret.hunter", { kind: t(`turret.kinds.${target.type}`), index: formation.numbers[target.id] ?? 1 })} hp={target.hp} />
            {target.countdown !== null && <span>{t("turret.countdown", { count: target.countdown })}</span>}
          </div>
        )}
        {pack.length > 0 && (
          <div className="space-pack space-sway">
            {pack.map(({ type, count }) => (
              <button
                key={type}
                type="button"
                className="space-hunter"
                aria-label={t("patrol.others", { count, kind: t(`turret.kinds.${type}`) })}
                onClick={() => setAim(nextOfKind(formation, aim, type))}
              >
                <FxSprite slice={HUNTER_SPRITES_SMALL[type]} />
                <span aria-hidden="true">×{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <TechnoBox className="space-bar">
        {ship.charges !== null && (
          <div className="space-charges">
            <ChargeRow count={Math.ceil(ship.charges / 2)} />
            <span aria-hidden="true">{ship.charges}</span>
            <ChargeRow count={Math.floor(ship.charges / 2)} />
            <span className="sr-only">{t("turret.charges", { charges: ship.charges })}</span>
          </div>
        )}
        {target && slot !== undefined ? (
          <div className="space-fire" role="group" aria-label={t("turret.label")} onKeyDown={onKeyDown}>
            <button type="button" aria-label={t("patrol.prevTarget")} disabled={list.length < 2} onClick={() => step(-1)}>
              <span aria-hidden="true">◀</span>
            </button>
            {shoot && (
              <ActionButton view={view} option={shoot} onAction={onAction} className="big space-shoot">
                <ActionLabel text={t("actions.turretAttack")} cost={shoot.cost} chance={shoot.chance} visibility={actionVisibility(shoot.action.type)} />
              </ActionButton>
            )}
            <button type="button" aria-label={t("patrol.nextTarget")} disabled={list.length < 2} onClick={() => step(1)}>
              <span aria-hidden="true">▶</span>
            </button>
          </div>
        ) : (
          <p>{t("turret.none")}</p>
        )}
        {shipOptions.length > 0 && (
          <div className="space-actions">
            {shipOptions.map((option) => (
              <ActionButton
                key={JSON.stringify(option.action)}
                view={view}
                option={option}
                onAction={onAction}
                hint={option.action.type === "collect_scrap" && ship.debris ? t("patrol.debris", { count: ship.debris }) : undefined}
              >
                <ActionLabel text={names.action(option.action.type)} cost={option.cost} chance={option.chance} visibility={actionVisibility(option.action.type)} />
              </ActionButton>
            ))}
          </div>
        )}
      </TechnoBox>
    </section>
  );
}

/** A craft's name and hp (overlapping shield icons beside the figure), shown underneath both your ship and the aimed hunter. */
function CraftReadout({ name, hp }: { name: string; hp: number }) {
  const { t } = useTranslation();
  return (
    <>
      <strong>{name}</strong>
      <span className="space-stat">
        <IconStack slice={FX_SHIELD} count={hp} />
        <span>{t("turret.hp", { hp })}</span>
      </span>
    </>
  );
}

/** A horizontal stack of `count` icons, each overlapping the one before by all but 5px (decorative: the number is beside it). */
function IconStack({ slice, count }: { slice: readonly [number, number, number, number]; count: number }) {
  if (count <= 0) return null;
  const style = { "--overlap": `${5 - slice[2]}px` } as CSSProperties;
  return (
    <span className="space-stack" style={style} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <FxSprite key={i} slice={slice} />
      ))}
    </span>
  );
}

/** One side of the charges around the centred number: the charges alternate left and right (the odd ones left), side by
 *  side without overlapping (decorative: the number says it). */
function ChargeRow({ count }: { count: number }) {
  return (
    <span className="space-charge-row" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <FxSprite key={i} slice={FX_CHARGE} />
      ))}
    </span>
  );
}

/** The ship as it stands in its bay: the room art's `spaceship` slice (or the Pasiphae's), at 1x. */
function ShipSprite({ layout, ship }: { layout: ShipLayout | undefined; ship: string }) {
  const slice = layout?.slices[patrolShip(ship)?.kind === "pasiphae" ? "pasiphae" : "spaceship"]; // i18n-ignore: slice names
  const url = layout && slice && atlasUrl(layout, slice.sheet);
  if (!slice || !url) return null;
  const style: CSSProperties = { width: slice.width, height: slice.height, backgroundImage: `url(${url})`, backgroundPosition: `-${slice.x}px -${slice.y}px` };
  return <span className="fx-sprite" style={style} aria-hidden="true" />;
}
