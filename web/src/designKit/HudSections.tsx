// The kit's in-game HUD sections: top bar, ship card (phone), Inspect, inventory, action queue, tip, peek bar and the
// status and item attribute icon catalogs. Each renders the real component on a sample view (samples.ts). Dev-only.

import { DEFAULT_CONFIG, doorId, statusIdsFor, type PlayerView, type RoomId, type Target } from "@mush2/shared";
import { useState } from "react";
import { ActionQueue } from "../hud/ActionQueue.tsx";
import { InspectPanel } from "../hud/InspectPanel.tsx";
import { ItemAttrIcons } from "../hud/ItemAttrIcons.tsx";
import { InventoryOverlay } from "../hud/InventoryOverlay.tsx";
import { PeekBar } from "../hud/PeekBar.tsx";
import { PlantStates } from "../hud/PlantStates.tsx";
import { ShipOverlay } from "../hud/ShipOverlay.tsx";
import { StatusIcons } from "../hud/StatusIcons.tsx";
import { TipCard } from "../hud/TipCard.tsx";
import { TopBar } from "../hud/TopBar.tsx";
import { useShipLayout } from "../iso/shipLayout.ts";
import { Figure, noop, Section } from "./KitSection.tsx";
import { brokenView, freshView, humanView, itemsView, mushView, preselectionView, queueView } from "./samples.ts";

const self = (view: PlayerView): Target => ({ kind: "player", id: view.you.id });

/** Twenty minutes from page load, so the countdown has something to count. */
const NEXT_CYCLE = Date.now() + 20 * 60_000;

export function SampleTopBar({ view, ...rest }: { view: PlayerView } & Partial<Parameters<typeof TopBar>[0]>) {
  return (
    <TopBar
      view={view}
      showSummary={false}
      canReady={false}
      onReady={noop}
      nextCycleAt={NEXT_CYCLE}
      botsPaused={null}
      onLeave={noop}
      onResults={noop}
      cheatsAllowed={false}
      onCheat={noop}
      onRoleCheat={noop}
      onLeaveShip={noop}
      {...rest}
    />
  );
}

export function TopBarSection() {
  return (
    <Section
      id="top-bar"
      heading="Top bar"
      about={
        <>
          <code>hud/TopBar.tsx</code>: day and cycle with <code>CycleCountdown</code>, the ship&apos;s resources and titles (
          <code>ShipResources</code>, <code>TitleChip</code>; desktop only), and the settings gear, which opens the real{" "}
          <code>SettingsDialog</code>. On a phone it also carries <code>PlayerSummary</code> (<code>showSummary</code>) and
          folds the buttons into a menu.
        </>
      }
      row="m2k-stack"
    >
      <Figure caption="Commander, cycle countdown running">
        <SampleTopBar view={humanView} />
      </Figure>
      <Figure caption="Pre-selection, AI crew paused (budget), End cycle offered, cheats allowed (gear → Cheats tab)">
        <SampleTopBar view={preselectionView} botsPaused="budget" canReady cheatsAllowed />
      </Figure>
      <Figure caption="Phone summary (showSummary), Mush: meant for phone widths, cramped on desktop">
        <SampleTopBar view={mushView} showSummary />
      </Figure>
    </Section>
  );
}

export function ShipOverlaySection() {
  return (
    <Section
      id="ship-overlay"
      heading="Ship card (phone)"
      about={
        <>
          <code>hud/ShipOverlay.tsx</code>: on a phone the top bar has no room for the ship&apos;s resources, so a button in
          the room&apos;s lower right opens them (the same <code>ShipResources</code> as the desktop top bar). Click it.
        </>
      }
    >
      <Figure caption="Closed until pressed">
        <div className="room-view m2k-room m2k-room-tall">
          <ShipOverlay view={humanView} />
        </div>
      </Figure>
    </Section>
  );
}

export function SampleInspect({ view, target }: { view: PlayerView; target: Target }) {
  const layout = useShipLayout();
  return (
    <div className="m2k-inspect">
      <InspectPanel view={view} {...(layout && { layout })} target={target} onAction={noop} onDeselect={target.id === view.you.id ? undefined : noop} />
    </div>
  );
}

export function InspectSection() {
  const neighbour = humanView.players.find((p) => p.room === humanView.you.room);
  const equipment = humanView.roomEquipment[0];
  const item = itemsView.inventory.find((i) => i.type === "blaster");
  const heavy = itemsView.inventory.find((i) => i.type === "machine_gun");
  const brokenItem = brokenView.inventory.find((i) => i.broken);
  const brokenEquipment = brokenView.roomEquipment.find((e) => e.broken);
  return (
    <Section
      id="inspect"
      heading="Inspect"
      about={
        <>
          <code>hud/InspectPanel.tsx</code>: the left panel, whatever is selected, with the legal actions as{" "}
          <code>ActionButton</code>s (<code>ActionLabel</code> costs and odds). For a person it shows{" "}
          <code>SkillSlots</code> (click a free slot for the picker and its <code>ConfirmPanel</code>) and{" "}
          <code>StatusIcons</code>; for an item, <code>ItemFace</code> and <code>ItemAttrIcons</code>. Broken items and equipment offer a repair. Hacking isn&apos;t in the game, so there is no hacked sample.
        </>
      }
    >
      <Figure caption="Yourself: commander, Pilot, one free slot">
        <SampleInspect view={humanView} target={self(humanView)} />
      </Figure>
      <Figure caption="Yourself as Mush (spores; the slots toggle to Mush skills)">
        <SampleInspect view={mushView} target={self(mushView)} />
      </Figure>
      {neighbour && (
        <Figure caption="Someone else in the room">
          <SampleInspect view={humanView} target={{ kind: "player", id: neighbour.id }} />
        </Figure>
      )}
      {equipment && (
        <Figure caption="Equipment (with its sprite once the ship layout loads)">
          <SampleInspect view={humanView} target={{ kind: "equipment", id: equipment.id }} />
        </Figure>
      )}
      {item && (
        <Figure caption="A blaster you carry">
          <SampleInspect view={itemsView} target={{ kind: "item", id: item.id }} />
        </Figure>
      )}
      {heavy && (
        <Figure caption="A heavy item (ItemAttrIcons: hover the weight for its MP penalty)">
          <SampleInspect view={itemsView} target={{ kind: "item", id: heavy.id }} />
        </Figure>
      )}
      {brokenItem && (
        <Figure caption="A broken blaster (repair instead of use)">
          <SampleInspect view={brokenView} target={{ kind: "item", id: brokenItem.id }} />
        </Figure>
      )}
      {brokenEquipment && (
        <Figure caption="Broken equipment: the coffee machine">
          <SampleInspect view={brokenView} target={{ kind: "equipment", id: brokenEquipment.id }} />
        </Figure>
      )}
    </Section>
  );
}

function SampleInventory({ view }: { view: PlayerView }) {
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<Target>(self(view));
  return (
    <div className="room-view m2k-room m2k-room-tall">
      <InventoryOverlay view={view} selected={selected} onAction={noop} onSelect={setSelected} zoom={zoom} onZoom={setZoom} />
    </div>
  );
}

export function InventorySection() {
  return (
    <Section
      id="inventory"
      heading="Inventory"
      about={
        <>
          <code>hud/InventoryOverlay.tsx</code>: the sack in the room&apos;s lower right (and the zoom buttons) opens{" "}
          <code>InventoryPanel</code>: your slots and the room&apos;s floor, each item an <code>ItemIcon</code> with its{" "}
          <code>ConsumeEffects</code>. Click the sack.
        </>
      }
    >
      <Figure caption="A blaster, a ration and a heavy machine gun">
        <SampleInventory view={itemsView} />
      </Figure>
      <Figure caption="The starting inventory">
        <SampleInventory view={freshView} />
      </Figure>
    </Section>
  );
}

export function RoomCornerSection() {
  return (
    <Section
      id="room-corners"
      heading="Action queue and tips"
      about={
        <>
          <code>hud/ActionQueue.tsx</code> sits in the room&apos;s bottom left (beside AP and MP on desktop) while you have
          actions under way; <code>hud/TipCard.tsx</code> floats over the room&apos;s bottom middle. Dismissed and muted tips
          are remembered in this browser, as in the game.
        </>
      }
    >
      <Figure caption="One search under way, two waiting">
        <div className="room-view m2k-room m2k-room-tall">
          <div className="room-bottom-left">
            <ActionQueue view={queueView} onClear={noop} />
          </div>
        </div>
      </Figure>
      <Figure caption="The first tip of a fresh ship">
        <div className="room-view m2k-room m2k-room-tall">
          <TipCard view={freshView} />
        </div>
      </Figure>
    </Section>
  );
}

const NO_ROOMS = new Set<RoomId>();

export function PeekBarSection() {
  const equipment = humanView.roomEquipment[0];
  return (
    <Section
      id="peek-bar"
      heading="Peek bar (phone)"
      about={
        <>
          <code>hud/PeekBar.tsx</code>: the phone&apos;s bar above the bottom nav for whatever was tapped. Its CSS shows it only
          below 1024px, so narrow the window to see these.
        </>
      }
      row="m2k-stack"
    >
      <Figure caption="Yourself (the default)">
        <PeekBar view={humanView} target={self(humanView)} reachable={NO_ROOMS} onAction={noop} onMove={noop} onMore={noop} />
      </Figure>
      {equipment && (
        <Figure caption="Equipment">
          <PeekBar view={humanView} target={{ kind: "equipment", id: equipment.id }} reachable={NO_ROOMS} onAction={noop} onMove={noop} onMore={noop} />
        </Figure>
      )}
      <Figure caption="A door you can't go through">
        <PeekBar view={humanView} target={{ kind: "door", id: humanView.doors[0]?.id ?? doorId(humanView.you.room, "CORRIDOR_A") }} reachable={NO_ROOMS} onAction={noop} onMove={noop} onMore={noop} />
      </Figure>
    </Section>
  );
}

/** Every status the game knows, so missing art shows at a glance. */
const ALL_STATUSES = statusIdsFor(DEFAULT_CONFIG.diseases.allDiseases);

export function StatusIconsSection() {
  return (
    <Section
      id="status-icons"
      heading="Status icons"
      about={
        <>
          <code>hud/StatusIcons.tsx</code>: every status (diseases included) in one row, then contamination as a Mush sees
          it on a human. Hover, focus or tap one for its card. A catalog, not a game state: no one has all of these.
        </>
      }
    >
      <Figure caption={`All ${ALL_STATUSES.length} statuses, then contamination 3`}>
        <StatusIcons statuses={ALL_STATUSES} contamination={3} />
      </Figure>
    </Section>
  );
}

export function ItemAttrIconsSection() {
  return (
    <Section
      id="item-attr-icons"
      heading="Item attribute icons"
      about={
        <>
          The icon rows the Inspect panel shows under an item&apos;s name, styled like a player&apos;s statuses:{" "}
          <code>hud/ItemAttrIcons.tsx</code> (heavy, with the MP penalty in its card) and <code>hud/PlantStates.tsx</code>{" "}
          (a planted hydropot; sickness shows only to the Botanist). Hover, focus or tap one for its card.
        </>
      }
    >
      <Figure caption={`Heavy (${DEFAULT_CONFIG.heavy.mpPenalty} MP per move)`}>
        <ItemAttrIcons heavy mpPenalty={DEFAULT_CONFIG.heavy.mpPenalty} />
      </Figure>
      <Figure caption="Plant: young and thirsty">
        <PlantStates plant={{ species: "fruit_banana", age: 1, thirst: 1 }} />
      </Figure>
      <Figure caption="Plant: dried and sick (as the Botanist sees it)">
        <PlantStates plant={{ species: "fruit_banana", age: null, thirst: 2, sick: true }} />
      </Figure>
    </Section>
  );
}
