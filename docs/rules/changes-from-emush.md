# Changes in Mush: Evolved compared to eMush

This document summarizes the **implemented** gameplay, mechanical, and UI differences between **Mush: Evolved** and **eMush**, ordered from **most meta-defining** to **quality-of-life**, as a quick reference for eMush veterans. Mechanics that work the same in both games are omitted or noted only briefly for context; features not yet built are excluded.

**Impact Legend:**
🔴 **Meta-Changing** (win conditions, deduction rules, core loop) · 🟠 **High Impact** (skills, sabotage, health, botany) · 🟡 **Medium Impact** (space, projects, ship upkeep) · 🔵 **QoL & Modes** (UI, chat, solo play)

**Jump to:**
[Quick Warning](#tldr-what-will-trip-up-an-emush-veteran) ·
[1. Win Conditions & Endgame](#1-win-conditions--endgame) ·
[2. Deduction & Anti-Testing](#2-mush-identity-deduction--anti-testing) ·
[3. Action Loop & Research Sabotage](#3-real-time-action-loop--research-sabotage) ·
[4. Skills, Traits & Morale](#4-mush--human-skill-trait--morale-reworks) ·
[5. Health, Surgery & Botany](#5-health-injuries-surgery--botany) ·
[6. Space, Projects & Ship Upkeep](#6-space-projects-drones--merchants) ·
[7. Chat, UI & Solo Mode](#7-communication-ui--single-player-mode)

---

## Most significant changes summarized

> [!CAUTION]
>
> 1. **Eden is ALWAYS a Human win** — even if Mush are alive aboard. Passive Mush lose by default, and crews have a real reason to push Eden instead of stalling.
> 2. **No solo Commander launches** — returning to Sol or jumping to Eden requires **all three title holders' Launch Keys** inserted at the Command terminal, and the launch resolves at the next cycle change.
> 3. **No mechanical humanity tests** — Mush track **real morale** (they are not locked at 14) and **catch, carry, and spread diseases** with symptom logs. Morale math and vomiting no longer prove anyone human.
> 4. **Research can spoil & be sabotaged** — lab progress sits in pending samples tested by **Assays** at 25/50/75/100%, and Mush can covertly contaminate samples. On the bright side, **relaying is automatically pooled**.
> 5. **Actions take 1.5 seconds** — movement and almost all actions have a real-time cast bar (queue up to 3) with a visible overhead progress bar for public actions.
> 6. **Hidden tells are gone** — **Body Transfer** preserves human skills, **THE List** can name converted Mush (or Chun), and **Retro-Fungal Serum** puts *any* target into a 2-cycle blind coma.

---

## 1. Win Conditions & Endgame

### Eden Is Always a Human Win

> [!IMPORTANT]
> 🔴 **Eden Is Always a Human Win:** Unlike eMush (where reaching Eden with any Mush or infected cat aboard is a Mush victory), **Travel to Eden is always a human win** in Mush: Evolved, even with Mush alive. This breaks eMush's stalemate loop: the crew no longer has to pause endgame progress until every Mush is dead, and passive Mush can no longer win simply by waiting.
>
> - Computing at the Super Calculator works as in eMush (2 AP or 1 Computer point, 33% with the usual failure streak, 3 unhidden fragments on the Nexus floor, success public in the room, failure private), except the button shows disabled while fragments are short instead of hiding with none.
> - No star map tree or False Eden yet.

### Three-Key Launch Lock

> [!WARNING]
> 🔴 **No Solo Commander Jumps:** In eMush, the Commander alone can send the ship to Sol or Eden (allowing a Mush Commander or a Transfer into the Commander to end the game instantly). In Mush: Evolved, **Return to Sol** and **Travel to Eden** require **all three Launch Keys** inserted at a working Command terminal:
>
> - Each title (**Commander**, **NERON Admin**, **Comms Officer**) has a launch key its holder inserts or removes for **0 AP** (public room log).
> - A title changing hands automatically **switches its key off**, and **only people on the Bridge** can see which keys are currently inserted.
> - Launching does **not** end the game immediately: everyone off-ship dies, travel locks, and the game ends at the **next cycle change** with no cycle-change processing (showing a faster-than-light star field meanwhile).

| Impact | Mechanic | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🟠 | **Hostile NPCs Aboard Ship** | Creatures exist only on planetary expeditions. | Hostile creatures can board and roam the Daedalus with HP, AP, and MP like players, taking a turn at each cycle change (Move or Punch; Pacifist, Bodyguard, Elusive, Ceasefire, and guardians apply to them as to players). Targetable by Punch, Attack, and Throw Out. Planned, but not yet implemented. |

---

## 2. Mush Identity, Deduction & Anti-Testing

> [!IMPORTANT]
> 🔴 **Core Design Pillar — No Incidental Proof of Humanity:** In Mush: Evolved, mechanics that accidentally clear humans in eMush have been closed so deduction comes from clues and detective work rather than mechanical proofs.

### Real Mush Morale & Disease Carrying

> [!NOTE]
> 🔴 **Mush Track Real Morale:** In eMush, Mush morale is permanently locked at 14 and unaffected by food, traits, or penalties (allowing "what's your morale?" arithmetic checks). In **Mush: Evolved**, **Mush track real morale** so a Mush's morale naturally mirrors a human's:
>
> - Mush keep their current morale on conversion and gain or lose morale from **every source**: consumables (food, alien fruits, and drugs apply their morale delta to Mush even though Mush still gain 0 AP/HP/MP/buffs from them, while still adding satiety), daily morale loss, innate character traits (Raluca's **Antisocial**, Finola's **Germaphobe**), crew deaths (−1, or −2 for Chun, plus −2 if Pregnant), incidents, speeches, Comfort, and Demoralizer.
> - At **0 morale**, Mush receive the private **Hopeless** status just like humans, but **never die from it**.

| Impact | Mechanic | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🔴 | **Mush as Disease Carriers** | Mush are immune to diseases and silently cure existing ones at cycle change. | Mush **catch, carry, and spread diseases** (from alien fruits, spoiled food, incidents, room spread, and comforting/intimate actions) with the same odds and delays as humans, and perform symptom log actions (vomiting, sneezing), but **suffer no stat penalties**. |
| 🔴 | **Body Transfer** | Deletes the victim's human skills (leaving a visible reset trace); can target inactive players. | **Preserves the victim's human skills** (no reset trace) and **cannot target inactive players**. (In both games, private logs and private channels stay with the body.) |
| 🔴 | **Retro-Fungal Serum Coma** | **No coma:** cures a Mush and removes their human skills immediately (no coma on humans or Mush). | Vaccinating **any** target (human or Mush, cured or not) puts them into a **2-cycle coma** with **total blindness** (room and ship-wide view hidden until it ends), blocking all actions except marking ready, keeping inventory and bed AP gain, clearing active stances/queue, resetting inactivity, and **permanently omitting** all logs and chat (including system messages) written during the coma. |
| 🔴 | **THE List (Tabulator)** | Bridge equipment; prints non-starting-Mush count minus 1 every 12h; guarantees a living **starting** Mush only. | Fixed item in **Front Storage** (cannot be taken, dropped, hidden, dismantled, or sent by tube; can break at cycle change, be sabotaged, and repairs at 12%). Printing (0 AP, Tracker, once per game, never again once torn) gives **8 names minus 1 per whole day since Mush selection** (minimum 1). Guarantees a living starting Mush if any, else **a converted Mush**, else **Chun**; filler is living crew other than Chun; still prints with no Mush left, saying none remain aboard. |
| 🟠 | **Spore Sucker** | Blocks Chun; different log for Mush; applies a 4-cycle cooldown status (not curable by surgery). | **1 AP**, reusable: removes 1 contamination from a human (**Chun allowed**; neutral private log), deals **3 HP damage**, and inflicts a **4-cycle Stiff Neck injury** (prevents lying down, gets you out of bed, acts as cooldown, and **is curable by surgery**). |
| 🟠 | **Finola's Lost Analysis** | Always marks Chun negative. | **Chun is rolled like any other non-Mush character** (2.5 × starting Mush, rounded down, non-Mush bodies marked negative at Mush selection). |

Unchanged from eMush: spore extraction, Fertile's free first daily extraction, personal/daily spore caps, covert spiking with 4-cycle cooldown, same-room spore badges for Mush, Epigenetics, and Schrödinger infection.

### Room Log Changes

Shared baseline: both games use the same four visibility tiers (Public, Secret, Covert, Private), 8-cycle room log window (16 with Tracker), Tracker-only movement direction for players, and never let cameras reveal camera sabotage or green jellying.

| Impact | Mechanic | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🟠 | **Observant Rolls Per Holder** | One 25% roll if any Observant is in the room. | Rolls **25% independently per living Observant** in the room. |
| 🟡 | **NPC Movement Direction** | Hidden without Tracker. | Drones, Schrödinger, and hostile NPCs **always show their movement direction** in room logs without needing Tracker. |

---

## 3. Real-Time Action Loop & Research Sabotage

| Impact | System | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🔴 | **Action Resolution & Queue** | Instant turn-based actions on click. | Almost all actions (including movement) take **1.5 seconds** of real time and resolve at the end of a cast bar, with a **queue of up to 3 actions**. If a modifier changes a queued action's AP cost before it resolves, it is cancelled at no cost. Roommates see a generic progress bar over the actor's head for actions that leave a visible room log. |
| 🔴 | **Research Samples & Assays** | Instant progress per action; no sample spoilage or sabotage. | Research tokens enter as **pending samples**. When verified + pending progress hits **25%, 50%, 75%, or 100%**, an **assay** tests all pending samples (**12% natural spoil chance**; spoiled samples are removed; verified progress never falls). A public lab log names everyone tested and whose samples spoiled, never why. **Own Spoil:** Mush can submit a pre-contaminated sample that always fails assay (recorded in action history). **Contaminate:** Saboteurs can spend **1 AP** (private) to contaminate a pending sample from the **smallest contributor** on that research. |
| 🟠 | **Research & PILGRED Relaying** | Strict turn-order relay penalty (−2% per consecutive action by the same player). | **Pooled Relay Tokens:** Contributions enter a pool as tokens and are **automatically arranged** for the lowest possible repeat penalty. A player is only penalized if they hold more tokens than everyone else combined plus 1, and highest rolls are assigned to the highest bases so progress never drops. |
| 🟠 | **ACTOPI (BIOS Toggle & Research)** | Off at game start; requires completing the *ACTOPI Protocol* NERON project or carrying an iTrackie 2 to see who is in each room. | Starts **off** at game start; *ACTOPI Protocol* is moved from NERON projects to an **early-game lab research** (no requirements). Completing it turns ACTOPI on and unlocks its NERON BIOS toggle so the NERON Admin can switch it off/on afterwards. |

> [!TIP]
> **Lab Relaying Tip:** Because relay tokens are automatically pooled and optimally ordered, you no longer need to wait for a partner to click between every single lab or PILGRED action—just avoid putting in more total actions than the rest of the team combined + 1.

---

## 4. Mush & Human Skill, Trait & Morale Reworks

### Reworked Mush Skills

*(**Demoralizer** works the same as eMush's Disheartening Contact, with only its English name changed.)*

| Impact | Mush Skill | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🟠 | **Nightmarish (Bad Luck Curse)** | 0 AP; gives nightmares to a sleeping player, costing sleep bonuses. | **2 AP covert** action on any living human roommate (in bed or not) applying the curse **Bad Luck** for **8–16 cycles** (recursing rerolls it): the victim's action **injury and dirt chances are multiplied by 4**, and Metal Plate / Tremor incidents always deal **maximum** damage. **Curses** are a new ailment type **hidden from the holder** (even their action odds hide it); Mush see it on roommates as a Mush-only status, never overhead. |
| 🟠 | **Nimble Fingers** | Grants secret camera install/remove actions only. | **0 AP instant toggle** (enter/exit Nimble mode, private status). While active, all room-level **Public** actions (including movement) become **Secret** when unwitnessed and unfilmed (staying plain Public if witnessed/filmed so Nimble mode doesn't leak). |
| 🟠 | **Doorman** | Once per day (0 AP) on a **random** working door in the room. | Lets the Mush **choose which working door** in the room to break, with **no daily limit** (**first use each day is 0 AP**, subsequent uses cost **2 AP**). |
| 🟠 | **Mycelium Spirit (Fairy Ring)** | While the holder lives, the Mush can make 1 more spore per day. | Once per game, **1 AP and 2 spores** grow a **Fairy Ring** in your room, invisible to humans (Mush in the room see it). Once a day, **one Mush** can draw **1 spore** from it for **1 AP** (2 after Constipaspore serum), **without getting dirty** and **outside the daily spore limit** (the holding limit of 2 still applies). Growing and drawing are secret and ring Myco-alarms. The ring disappears if its creator dies, is cured, or loses the skill. |
| 🟠 | **Hard-boiled** | Takes 1 off each non-critical combat hit (not expeditions), stacking with Plastenite Armor; a 1-damage hit is fully absorbed (0 damage). | Same reduction and stacking, but armor and Hard-boiled together **never reduce a hit below 1 damage**: a 1-damage hit goes through whole and no punch or weapon hit is fully absorbed. Plastenite Armor alone has the same floor of 1, including in expedition fights. |

### Reworked Human Skills & Actions

*(Only English display names changed for **Designer** [formerly Conceptor] and **Computer Scientist** [formerly IT Expert]; mechanics and point pools match eMush.)*

| Impact | Skill / Action | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🟠 | **Technician & Reinforce** | Reinforce works on unbroken targets only, uses metal scraps only (consumed on failure), and grants a binary Reinforced status. | Engineer points and Technician-only Dismantle match eMush. **Reinforce** (1 AP, 35%) works on **working or broken** targets and auto-picks scrap (+10% metal / +5% plastic, cap 50%, **consumed only on success**): gives percentage resistance to single-pick breakdown incidents, and **25% or more shielding blocks Dismantle and Sabotage**. |
| 🟠 | **Politician (Coup)** | Once per game at NERON's Core. | **Unlimited uses** (3 AP, 50% dirty, secret, at any working NERON Core); takes effect at the next cycle change if still alive and active. |
| 🟠 | **Persecutor (Anathema)** | The Outcast loses a fifth of their success chances and their stealth; titles are untouched. | Also drops the Outcast to the **bottom of every title line** while cursed: any title they hold passes on at once (unless nobody else can take it), and the reordered lines are visible to the whole crew. Lifting the curse restores their place but not their titles. |
| 🟠 | **Genius** | Instant Research or Project completion once per game. | Free action granting private Genius status: completes the next **Research** (skipping assay) or **NERON Project** at once, **or** guarantees the next **equipment repair or hull repair** succeeds (excluding PILGRED). |
| 🟡 | **Commander — Issue Mission** | Order dialog with custom text and accept/refuse step. | Simplified: **1 AP** from any room (once per ship per day, Commander title only) to privately grant **+3 AP** to any active living crewmate anywhere. |

### Innate Character Traits, Morale & Titles

Both games start characters with 0 skills (3 pickable + 1 book slot) and permanent innate traits that persist through conversion and Body Transfer. Only differences are listed below.

| Impact | Mechanic / Character | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🟠 | **Eleesha — Chronic Vertigo** | Curable disorder (psychiatrist / cure / time limit). | A **permanent, public trait** (no cure, no time limit) that **applies to a Mush Eleesha too**. Same symptom: cannot take off (patrol ship, Pasiphae, Icarus launch) or land on a planet, but can ride the Icarus as a passenger. Take off shows disabled with the reason instead of being hidden (same for Gastroenteritis and Slight Nausea groundings). |
| 🟠 | **Terrence — Wheelchair** | −2 MP on AP-to-MP conversion; free exit with any roommate (waiving all MP). | Keeps the −2 MP penalty and free exit (public log naming helper, waiving heavy items and Broken Ribs), but requires an **active, non-comatose** roommate to have stood in the room for at least **30 seconds** (preventing infinite pursuit evasion). Adds **Accommodate**: any roommate can offer to push him for 0 AP without waiting 30s (offers expire in 5 min; while pushed he moves with and is steered by his pusher for 0 MP until any public action on equipment or another person ends the push). |
| 🟠 | **Hopeless (0 Morale) & Death Morale** | Named Suicidal at 0 morale (humans die at cycle change); almost any crew death costs living humans −1 morale (−3 if Chun dies). | Renamed to **Hopeless** at **0 morale** (living humans still at 0 morale when any cycle ends die of depression). Every non-traded crew death (human or Mush) costs every living player **−1 morale** (**−2** if **Chun** dies via *Mankind's Only Hope*), and a **Pregnant crewmate's death** (when not traded) adds an extra **−2 morale**. |
| 🟠 | **Pregnancy (Do the Thing)** | Opposite-gender pairs only (neither already pregnant) roll 8% for the female partner (no extra spore or death morale penalty). | **All characters (human or Mush)** are eligible on Do the Thing: each living non-pregnant partner rolls **8% independently** to gain the permanent public **Pregnant** status. Becoming pregnant from a Mush partner inflicts **+1 extra contamination** (+2 total), and a pregnant crewmate's death (when not traded) costs every living player **−2 morale**. |
| 🟡 | **Title Succession** | Titles pass on death or inactivity and **revert** when a higher-priority holder returns. | Same succession lines on death or inactivity, but titles **do not revert** when an inactive holder returns. |

---

## 5. Health, Injuries, Surgery & Botany

### Injuries & Surgery

| Impact | Mechanic | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🟠 | **Surgery & Sepsis** | **Medic-only**, requires the patient to be **lying down**; failure inflicts permanent **Sepsis** (−4 HP/cycle until cured with 2 heal actions). | Anyone at a working Surgery Pod (or a Medic with a Medikit) can operate on **any injured patient** (no lying-down requirement; **2 AP on others / 4 AP on self** or 1 Nurse care point). **Failure inflicts Sepsis (1–3 cycles):** **−6 HP immediately**, then **−4 HP and −1 morale per cycle**. |
| 🟠 | **Damaged / Destroyed Ears** | Uppercases your sent messages and replaces others' messages with `"..."` while active. | **Total deafness to other players' messages** across all channels while injured: missed messages are **permanently omitted** from your view (even after surgery) and trigger **no unread badges, chips, or notifications**. Your own messages are not uppercased. |
| 🟡 | **Burnt Hand** | +1 AP on actions (exempting Move, Consume, Surgery, and Admin/immune actions). | **+1 AP surcharge applies only to actions that already cost more than 0 AP** (free actions, skill-point actions, and moves are unaffected). |
| 🟡 | **Third-Degree Burn (50%)** | +1 AP on actions; +10% chance to fall ill at cycle change. | +1 AP only on actions that already cost AP (moves unaffected); a **3% chance** at each cycle change to catch one of the incident diseases. |
| 🟡 | **Third-Degree Burn (90%)** | −4 max HP; +10% chance to fall ill; die of sepsis if you act, at cycle change, or if you get dirty. | −4 max HP, +1 AP on actions that cost AP, 3% incident-disease chance per cycle; **only getting dirty** kills by sepsis. |

### Botany, Starting Items & Hyperfreeze

| Impact | Mechanic | Difference in Mush: Evolved |
| :--- | :--- | :--- |
| 🟠 | **Value-Budgeted Alien Fruits** | Replaces eMush's independent per-trait rolls. Each of the 12 alien species is generated within a **3–6 point value budget** with a grow time of **4 cycles per point (12–24 cycles, always faster than bananas' 36 cycles)**. Base **+1 AP and +1 satiety** for humans, plus budgeted extra AP (+1/+2), morale (+1/+2/+3/−2), HP (+1/+2), **0–3 timed buffs** (**Treat Disease**, **Energize**, **Resistance**, **Perception**), and **0–3 delayed diseases** (30–80% odds, arriving **2–16 cycles** after eating). |
| 🟠 | **Graft Hybrids** | Instead of swapping the plant for the fruit's species, Graft creates a **hybrid** of the two species: one fixed per unordered pair of the 12 alien species for the whole ship (66 possible), drawn at launch from both parents' effects (AP, morale, and HP from a parent at random; each parent buff and disease kept at 50%, up to 3 each) and fitted to a **4–9 value budget**, with a grow time of 4 cycles per point capped at **32**. A pair that can't fit has no graft. Bananas and hybrids can't be grafted. A hybrid's effects are hidden like an alien species' (lore holders only) and unknown to everyone until first grafted. **Green Thumb** grafts start at **25%** of their grow time. |
| 🟡 | **Hydroponics Terminal** | New equipment starting in the **Hydroponic Garden** (not in eMush): while working, it protects plants in the Garden from fire; it can break, be sabotaged, and be repaired (12%). |
| 🟡 | **Spacesuits Starting Location** | The **6 spacesuits** start in the **Icarus Bay** (instead of the ship-wide random pool). |
| 🟡 | **Hyperfreeze** | Targets **cooked rations and alien steaks only** (never fruits) and **preserves their current spoilage stage** in place when turning them into non-perishable uncooked rations (eMush freezes fruits with a Frozen status and resets ration spoilage). |

---

## 6. Space, Projects, Drones & Merchants

### Space Combat, Expeditions, Drones & Merchants

| Impact | Mechanic | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🟠 | **Plasma Shield & Damage Split** | Inactive until the Plasma Shield project completes; when active, absorbs 100% of hunter damage up to current shield (0% of asteroids). | Starts **broken at 0/100** with its BIOS switch **off**, and can be repaired and switched on before the Plasma Shield project completes (+5/cycle when repaired and on). When active, it **splits every hit** (including asteroids), absorbing **33% base** or **67% with the Plasma Shield project** (rounded to the nearest integer). |
| 🟡 | **Following Hunters on Jump** | Following plain Hunters unpool on arrival (spending pool points, or spawning at least 1 hunter from half the pool if 0 plain hunters were present). | Following hunters (half of plain Hunters and Aracks rounded up, plus all Trax) resolve at departure without spending pool points; jumping with **0 hunters present brings 0 hunters**. |
| 🟡 | **Activity Overload (Hunter & Incident Points)** | Multiplied by every boarded player (dead included) ÷ max players while day's AP spent ≤ 7 × max players, else AP spent ÷ threshold; real AP only. | Same formula and threshold (7 × the ship's 16 seats), but the low-activity share counts **only living players**, and an action paid with a **skill point counts the AP it would have cost**. |
| 🟡 | **Expeditions — Boarding & Instant Landing** | Launching picks up to 4 random living players in Icarus Bay; Landing resolves on the first exploration step. | Players explicitly **Board** (free, checks spacesuit on airless planets) and **Leave** (free) the docked Icarus; the launcher then takes off with everyone aboard. Boarded players **stay in the Icarus Bay** until takeoff, still reachable there; a public aggressive action on one puts them off the Icarus. The **Landing event resolves immediately at takeoff**, followed by 1 sector every **10 real minutes**. |
| 🟡 | **Support Drones** | Failure counters (repair, extinguish) only ever grow, so a drone trained on easy repairs stays better; repairs any broken door, equipment or item in the room, hidden ones included. | **Failure counters reset** on a successful repair or extinguish; drones **skip hidden items and items in an inventory**. |
| 🟡 | **Merchant Ships (Transport)** | Human officers trade 48h-AFK anywhere or 24h-AFK in Storage (Mush officers can trade active crew in Storage); blocked during hunter attacks; Techno Rewrite deactivates random projects; NERON announces fleeing attacked merchants. | Any officer can trade **any 24h+ Inactive crewmate from anywhere** (never active crew); trading is **allowed during hunter attacks**; **Techno Rewrite** lets the officer choose which finished ongoing-effect projects to trade away (**lost for good**); **shooting a merchant** requires confirmation, closes its conversation, and flees at the next cycle change (or drops wreckage at 0 HP) with **no public NERON announcement**. |
| 🟡 | **Xyloph Printing** | Xyloph items/documents queue in the Tabulatrix printer. | Xyloph items/documents spawn **directly on the Bridge floor** (no Tabulatrix). |

### Reworked and Rebalanced NERON Projects & Research

*(**Floor Heating**, **Noise Reducer**, **Heuristic Targeting**, and **Quantum Sensors** match eMush.)*

| Impact | Project / Research | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🟡 | **Pneumatic Tubes** *(was Pneumatic Dispenser)* | Automatically moves garden-grown fruits to the Refectory at day change. | Spawns **1 output tube and 2 input tubes** on the Nexus floor. Placing an input tube on a room floor lets anyone transfer items (0 AP) to a random room with an output tube on the floor. |
| 🟡 | **Icarus Magnetic Return** | Returns only the empty Icarus when all explorers die/get lost/are stranded; planet loot is destroyed. | Jumping or leaving orbit while an expedition (Icarus or patrol ship on a planet) is away **immediately recalls the living crew and loot safely** to its bay. |
| 🟡 | **Spatial Wave Radar** | Upgrades antenna for −1 AP on all comms actions and double Sol contact odds while unbroken. | **Unconditional passive** once built: **−1 AP** on contacting Sol and closing merchant deals, and rebel decodes take **the higher of two 1–40 rolls** instead of their average. |
| 🟡 | **Jukebox** | Gives a jukebox kit to build; plays one character's song per cycle (dead included); +2 morale if in room at cycle change. | **No kit**: spawns the jukebox in the **Refectory** (eMush: Alpha Bay 2). Songs come from **living** players only. Cycle-change bonus is **replaced** by a 0 AP **Listen** action, usable only while your own song plays, for **+3 morale**, **once per day** (public log naming you and the song). Check playlist (next 3 songs, private) is kept. |
| 🟡 | **Thalasso** | Unbreakable showers; grants **at most one** of the three 25% bonuses per shower. | Showering as a human rolls **three independent 25% checks** for **+1 HP**, **+1 morale**, and **+2 MP**. |
| 🟡 | **Scrap Heap** | Spawns 5 random items from a 14-item weighted pool across storages. | Spawns **7 specific items** distributed across the 5 storages: *thick tube, plastic scraps, 1 random skill book, 1 random gun blueprint (Rocket Launcher, Lizaro Jungle, or Old Faithful), rope, bandage, and 1 random misc item (knife, soap, hydropot, or gloves)*. |
| 🟡 | **Dismantling** | Spawns **5** metal scraps in the Engine Room. | Spawns **8** metal scraps on the Engine Room floor. |
| 🟡 | **Magnetic Net** | BIOS toggle; recovers patrol ships on jump. | **Always active once built** (no BIOS toggle). |
| 🟡 | **Meridon Scrambler** | 20% chance for plain **Hunters** to target any other hunter (including asteroids/transports). | Applies to **all shooting hunter types** and only targets a **random other shooting hunter** (never asteroids or merchants). |

---

## 7. Communication, UI & Single-Player Mode

| Impact | Feature | eMush | Mush: Evolved |
| :--- | :--- | :--- | :--- |
| 🔵 | **Single-Player Mode** | None. | **9-seat solo mode** where you are always the sole Mush against 8 AI bots (scripted or LLM-backed with your own API key), with manual cycle advancement and instant expeditions. |
| 🔵 | **Room Positions & Focused** | Abstract room presence only (accessing a terminal grants Focused). | Adds **tile walking** and **sitting on chairs** (visible to roommates). Opening a terminal physically seats/stands you at it while Focused. |
| 🔵 | **Rich Chat, Checklists & Channels** | Plain chat with 200-message truncation. | Supports Markdown formatting, **author-editable task checklists** (tickable on any page without rewriting message text), Discord-style threads under global chat, and 9 crew-wide feature channels (*Botany, Research, Inventory, Space Battle, Comms, PILGRED, NERON, Astrophysics, Expeditions*). History uses **50-message pages** with **no 200-message truncation**. |
| 🔵 | **Planet & Expedition Report Sharing** | Manual copy-paste into chat. | At the Astro terminal, share a planet into the Astrophysics channel with editable text plus **structured sector-slot icons** (true planet name and sector count are fixed; sector tags can be edited or faked). Shares automatically mark as *"no longer applicable"* when the ship jumps or leaves orbit (except the destination planet). Expedition members can likewise share editable reports into the Expeditions channel. |
| 🔵 | **Unified Signals Tab (Comms Officer Only)** | Separate interfaces; visible at terminal. | Rebel base calls and merchant ships are combined into one **Signals** conversation UI at the Comms Center (Active/Inactive lists, live garbled-to-clear rebel transcriptions, 3-second cosmetic reply delay). **Only players with Comms Officer access** (holder, hacker, or cheat) can view the Signals tab; bystanders cannot see rebel decode progress or merchant deals. |
| 🔵 | **Graveyard Channel** | No dedicated dead chat. | Dead players can read global and feature chat (and dead Mush read the Mush channel) and talk with other dead players in a dedicated **Graveyard** channel. |
