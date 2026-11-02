# Repair Drones (Support Drone)

Reference specification and design notes for Support Drones (`HELP_DRONE` / *Drone de soutien*).

---

## 1. Overview & Lore

* **ID**: `HELP_DRONE`
* **Name**: *Drone de soutien* (Support Drone)
* **Description**:
  > "Robots utilitaires d'assistance à l'équipage."  
  > "Le meilleur ami de l'homme du Daedalus. Ce drone pourra accomplir de nombreuses tâches à votre place. Le Drone effectue des actions similaires à celles des équipiers. Le drone de Soutien permet d'achever l'objectif de maintenance automatique de Magellan, grâce à son protocole Beta-Slave ils peuvent quasiment remplacer un vrai être humain. Sauf pour le faire."
* **Character Connection**: Closely tied to **Terrence Archer**, the disabled robotics engineer who joined the Daedalus crew to field-test his autonomous machines and tele-presence chassis. Terrence's personal Triumph objective (`ROBOTIC_GRAAL`) awards him **+4 Triumph** each time a drone is upgraded.
* **Name Generation**: Each drone is assigned a name dynamically upon creation:
  ```text
  "Robo " + <random_name> + " #" + <random 0-99>
  ```
* **Visual & Animation**:
  * In isometric view, hovers at a height of 2 units with a continuous sine-wave vertical bobbing motion:
    $$\text{pos}_z = 2 + \sin(\text{time} \times 0.003) \times 0.3$$
  * Every $\approx 2$ seconds (`TickLen = 2 \pm 0.5\text{s}`), it randomly picks an adjacent passable tile and smoothly tweens to that spot.
  * Associated assets:
    * Item icon: `help_drone.jpg`
    * Isometric graphic binding: `base_drone`
    * NERON project card: `extra_drone.png`

---

## 2. Acquisition & Construction

Drones enter the game via three distinct sources:

### Initial Ship Loadout
* Exactly **1 Support Drone** spawns at game start in the **Front Corridor** (`FRONT_CORRIDOR`).

### Blueprint Assembly
* **Item**: Blueprint (`BLUEPRINT`) specifying `HELP_DRONE`.
* **Recipe**:
  * 4 × Metal Scraps (`METAL_SCRAPS`)
  * 1 × Plastic Scraps (`PLASTIC_SCRAPS`)
  * Assembled using the `BUILD` action on the blueprint (weight 1).
* **Blueprint Sources**:
  * **Robotics Skill (`ROBOTICS`)**: The skill holder (primarily Terrence, or anyone acquiring it via Apprentron / Apprentice) starts with a Drone Blueprint added directly to their inventory upon selecting the skill.
  * **Xyloph Database / Communications**: Can occasionally be acquired as a blueprint drop from contacting Xyloph.

### NERON Project: Extra Drone (`EXTRA_DRONE`)
* **Project Name**: *Drone supplémentaire*
* **Tags**: `ENGINEER, ROBOTICS` (Technicians and Robotics experts grant +6% to +9% development efficiency).
* **Cost Modifier**: 10.
* **Effect**: Triggers `SpawnItem(HELP_DRONE, NEXUS_ROOM)`. Spawns a functional support drone directly in the Nexus. Once completed, the drone remains on board permanently even if active projects change.

---

## 3. Properties & Physical Interactions

* **Inventory Carrying**:
  * Normal item size (takes 1 personal inventory slot, not heavy).
  * Cannot be hidden (`Ne peut pas être caché`).
  * **Autonomous While Carried**: Being in a player's inventory does **not** disable the drone. At cycle turn, it will still execute its tasks and can move out into an adjacent room.
* **Crew & Social Status**:
  * **Not a crew member**: Does not trigger Raluca's *Asocial* trait penalty (Raluca will not lose 1 Morale at cycle turn if only drones are in the room with her).
  * **Not a witness**: Does not act as a camera or crew witness. It will not reveal discrete or furtive actions executed in the room.
* **Vulnerabilities & Breakage**:
  * Marked as electrical equipment (`electric: true`).
  * Cannot break spontaneously through passive cycle decay.
  * Cannot be sabotaged using the standard crew `Saboter` action.
  * **Can break from**:
    * **Incendie** (Room Fire): Subject to fire damage per cycle unless protected by the *Firefighter* upgrade.
    * **Surcharge électrique** (Electrical Overload incident): Destructive electrical arcs break electronic gear in the room.
    * **Mush Gelée verte** (*Green Jelly* / `Engluer`): 1 PA furtive action that targets electronic items. After a delay of 1–4 cycles, the drone breaks and NERON reports the breakdown.
* **Repairs**:
  * Base repair chance when broken is 8% (baseline equipment repair rate).
  * Can be repaired by humans using the standard `Réparer` action.
  * Can also be repaired by another operational support drone present in the room.

---

## 4. Cycle Turn & Priority Loop

Drones execute autonomous actions at cycle change:

* **Action Budget**: 1 action per cycle by default (up to 2 actions if upgraded with *Turbo*).
* **Action Priority Hierarchy**:
  1. **Extinguish Fire** (requires *Firefighter* upgrade)
  2. **Repair Equipment & Items** (base ability)
  3. **Launch Patrol Ship** (requires *Pilot* upgrade, only if hunters are present outside)
  4. **Shoot Hunter** (requires *Pilot* upgrade, while in flight with active targets)
  5. **Land Patrol Ship** (requires *Pilot* upgrade, once external hostiles are eliminated)
  6. **Move Room** (random adjacent room, or guided navigation if equipped with *Sensor*)
* **Turn Consumption**: Every discrete event (room movement, repair attempt, launch, shot, landing) consumes 1 action from the drone's budget for that cycle.
* **Free Ship Repairs**: Unlike human players who must consume 1 Metal Scrap when renovating or repairing patrol ships and the Pasiphae, drones perform vessel repairs completely free of scrap cost.
* **Target Sorting**: When repairing in a room with multiple damaged assets, the drone addresses damaged equipment and items in order of their creation date. Drones can attempt repairs on hidden or personal broken items (logging the repair without revealing the item to the public room shelf).

---

## 5. Success Rates

Drones follow the standard human success calculation:

* **Action Success Chances**:
  * **Firefighting**: 25% base chance.
  * **Hunter Shooting**: 40% human baseline + 20% drone bonus = 48% base chance.
  * **Repairs**: Matches the base repair rate of the target item/equipment (e.g. 50%, 25%, 12%, 8%, etc.).
* **Dynamic Reset**:
  * Attempting actions utilizes standard successive-attempt scaling where applicable.
  * When an action completes or the attempt cycle concludes, the probability resets to baseline exactly like human actions rather than accumulating permanently.

---

## 6. Upgrades (`DronePowerUp`)

Drones can be enhanced with up to 4 additional modular power-ups (in addition to their built-in base functionality).

```haxe
enum DronePowerUp {
    DPU_REPAIR_EQUIPMENT;   // Base Technician functionality
    DPU_EXTINGUISH_FIRE;    // Firefighter (Pompier)
    DPU_DRIVE_SPACE_SHIP;   // Pilot (Pilote)
    DPU_PATHFIND;           // Sensor (Senseur)
    DPU_ENHANCED;           // Turbo
}
```

### Upgrading Action (`UPGRADE_DRONE`)
* **Executor**: Requires a character with the **Robotics** (`ROBOTICS`) skill.
* **Cost**: **2 PA** + **2 Metal Scraps** (`METAL_SCRAPS`).
* **Side Effects**: 25% chance of getting dirty, 5% chance of minor physical injury.
* **Log**: Tracked action (public ship event).
* **Triumph**: Awards +4 Triumph to Terrence Archer.

### Upgrade Breakdown

| Upgrade | In-Game Name | Internal Enum | Description & Mechanics |
| :--- | :--- | :--- | :--- |
| **Technician (Base)** | *(De base)* | `DPU_REPAIR_EQUIPMENT` | **Default on all drones.** Prioritizes repairing broken equipment and items in its current room before attempting to move. |
| **Firefighter** | *Pompier* | `DPU_EXTINGUISH_FIRE` | Attempts to extinguish fires in the room before moving (acting immediately when a fire ignites at cycle change). **Grants permanent fire immunity** (`ignifuge`): the drone can no longer be damaged or broken by fires. |
| **Pilot** | *Pilote* | `DPU_DRIVE_SPACE_SHIP` | If external hunters are present and a patrol ship is docked in the bay, the drone boards and launches. Receives a **+20% accuracy bonus** over baseline human shooting (starts at 48%). Lands automatically when all hunters are eliminated. |
| **Turbo** | *Turbo* | `DPU_ENHANCED` | Grants an **80% chance** to perform a **second independent action** during the same cycle (e.g. move + repair, repair + repair, or double shoot). Does not grant a third action. |
| **Sensor** | *Senseur* | `DPU_PATHFIND` | Replaces random wandering with intelligent, targeted pathfinding. Directs the drone along the shortest path toward active problems matching its installed modules: `Fire > Broken Equipment > Hunters (if Pilot) > Random Move`. In the event of equidistant targets, tie-breaking follows the fixed internal room door order. |
