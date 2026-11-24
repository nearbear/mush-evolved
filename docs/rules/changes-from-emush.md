# Changes in Mush: Evolved compared to eMush

This document summarizes the **implemented** gameplay, mechanical, and UI differences between **Mush: Evolved** and **eMush**, written as a quick reference for eMush veterans. Mechanics that work the same in both games are omitted or noted only briefly for context; features not yet built are excluded.

---

## 1. Core Loop, Matchmaking, and Modes

| Feature | eMush | Mush: Evolved |
| :--- | :--- | :--- |
| **Action Resolution & Queue** | Instant turn-based actions on click. | Almost all actions (including movement) take **1.5 seconds** of real time and resolve at the end of a cast bar, with a **queue of up to 3 actions**. If a modifier changes a queued action's AP cost before it resolves, it is cancelled at no cost. Roommates see a generic progress bar over the actor's head for actions that leave a visible room log. |
| **Room Positions & Focused** | Abstract room presence only (accessing a terminal grants Focused). | Adds **tile walking** and **sitting on chairs** (visible to roommates). Opening a terminal physically seats/stands you at it while Focused. |
| **Single-Player Mode** | None. | **9-seat solo mode** where you are always the sole Mush against 8 AI bots (scripted or LLM-backed with your own API key), with manual cycle advancement and instant expeditions. |

---

## 2. Communication, Chat, and Logs

### Room Logs

Shared baseline: both games use the same four visibility tiers (Public, Secret, Covert, Private), 8-cycle room log window (16 with Tracker), Tracker-only movement direction in logs, and never let cameras reveal camera sabotage or green jellying.

- **Persistent Tier Badges & Leaked Indicator:** eMush overwrites revealed Secret/Covert logs as Revealed. Mush: Evolved preserves the original tier badge (Private, Secret, Covert) and adds a **leaked** warning indicator when a secret or covert action is witnessed or caught on camera (highlighting leaked covert lines in red).
- **Observant Rolls Per Holder:** eMush makes one 25% roll if any Observant is in the room. Mush: Evolved rolls **25% independently per living Observant** in the room.
- **2D Doorway Spot Hidden Without Tracker:** In addition to hiding room-log movement direction, non-Trackers do not see a roommate's doorway entry/exit spot in the 2D room view (roommates fade in/out in place; Drones and Schrödinger still show direction to everyone).

### Chat, Channels, and Signals

- **Markdown, Checklists, Threads, and Pagination:** Chat supports Markdown formatting, **author-editable task checklists** (tickable on any page without rewriting message text), Discord-style threads under global chat, and 9 crew-wide feature channels (*Botany, Research, Inventory, Space Battle, Comms, PILGRED, NERON, Astrophysics, Expeditions*). History uses **50-message pages** with **no 200-message truncation**.
- **Structured Planet & Expedition Report Sharing:** At the Astro terminal, players can share a planet into the Astrophysics channel with editable text plus **structured sector-slot icons** (true planet name and sector count are fixed; sector tags can be edited or faked). Shares automatically mark as *"no longer applicable"* when the ship jumps or leaves orbit (except the destination planet). Expedition members can likewise share editable reports into the Expeditions channel.
- **Unified Signals Tab (Comms Officer Only):** Rebel base calls and merchant ships are combined into one **Signals** conversation UI at the Comms Center (with Active/Inactive lists, live garbled-to-clear rebel transcriptions, and a 3-second cosmetic reply delay). **Only players with Comms Officer access** (holder, hacker, or cheat) can view the Signals tab; bystanders at the terminal cannot see rebel decode progress or merchant deals.
- **Graveyard Channel:** Dead players can read global and feature chat (and dead Mush read the Mush channel) and talk with other dead players in a dedicated **Graveyard** channel.

---

## 3. Characters, Stats, Traits, and Skills

### Morale, Death, and Titles

| Mechanic | eMush | Mush: Evolved |
| :--- | :--- | :--- |
| **Hopeless (0 Morale) & Death Morale** | 0-morale status is named Suicidal (humans at 0 morale at cycle change die of depression); almost any crew death costs living humans −1 morale (−3 if Chun dies). | Suicidal is renamed to **Hopeless** at **0 morale** (living humans still at 0 morale when any cycle ends die of depression). Only a **Hopeless (depression) death** (−1 morale) or a **Pregnant crewmate's death** when not traded (−2 morale) deducts crew morale; other deaths do not deduct crew morale. |
| **Pregnancy (Do the Thing)** | Only opposite-gender pairs (when neither partner is already pregnant) roll 8% for the female partner to become Pregnant (no extra spore or death morale penalty in eMush). | **All characters (human or Mush)** are eligible on Do the Thing: each living non-pregnant partner rolls **8% independently** to gain the permanent public **Pregnant** status. Becoming pregnant from a Mush partner inflicts **+1 extra contamination** (+2 total), and a pregnant crewmate's death (when not traded) costs every living player **−2 morale**. |
| **Title Succession** | Titles pass along fixed succession lines on death or inactivity, and **revert** to a higher-priority character at cycle change when they return from inactivity. | Same succession lines on death or inactivity, but titles **do not revert** when an inactive holder returns. |

### Innate Character Traits

Both games start characters with 0 skills (3 pickable + 1 book slot) and permanent innate traits that persist through conversion and Body Transfer. Only the differences are listed below:

| Character | Trait | Difference in Mush: Evolved |
| :--- | :--- | :--- |
| **Chun** | **Mankind's Only Hope** | Her death does not inflict eMush's extra −2 crew morale penalty. |
| **Eleesha** | **Chronic Vertigo** | A **permanent, public trait** instead of eMush's curable disorder (no cure, no psychiatrist, no time limit), and it **applies to a Mush Eleesha too**. Same symptom: she can't take off (patrol ship, Pasiphae, Icarus launch) or land a ship on a planet, but can ride the Icarus as a passenger. Take off shows disabled with the reason instead of being hidden (so do the Gastroenteritis and Slight Nausea groundings). |
| **Terrence** | **Wheelchair** | Replaces eMush's solo AP-to-MP conversion penalty with **Accommodate**: any roommate can offer to push him for 0 AP (offers expire in 5 minutes). While pushed, Terrence moves with and is steered by his pusher for 0 MP until any public action on equipment or another person ends the push. |

### Reworked Human Skills & Actions

*(Only English display names changed for **Designer** [formerly Conceptor] and **Computer Scientist** [formerly IT Expert]; mechanics and point pools match eMush.)*

| Skill / Action | eMush | Mush: Evolved |
| :--- | :--- | :--- |
| **Commander — Issue Mission** | Order dialog with custom text and accept/refuse step. | Simplified: **1 AP** from any room (once per ship per day, Commander title only) to privately grant **+3 AP** to any active living crewmate anywhere. |
| **Politician (Coup)** | Once per game at NERON's Core. | **Unlimited uses** (3 AP, 50% dirty, secret, at any working NERON Core); takes effect at the next cycle change if still alive and active. |
| **Technician & Reinforce** | Reinforce works on unbroken targets only, uses metal scraps only (consumed on failure), and grants a binary Reinforced status. | Engineer points and Technician-only Dismantle match eMush. **Reinforce** (1 AP, 35%) works on **working or broken** targets and auto-picks scrap (+10% metal / +5% plastic, cap 50%, **consumed only on success**): gives percentage resistance to single-pick breakdown incidents, and **25% or more shielding blocks Dismantle and Sabotage**. |
| **Genius** | Instant Research or Project completion once per game. | Free action granting private Genius status: completes the next **Research** (skipping assay) or **NERON Project** at once, **or** guarantees the next **equipment repair or hull repair** succeeds (excluding PILGRED). |
| **Bodyguard** | +2 AP on targeted aggressive actions while together; −1 AP discount on Guard. | Reprices queued aggressive actions on the VIP; omits the −1 AP discount on Guard. |

---

## 4. Mush Mechanics and Mush Skills

### Spore Economy, Morale, Diseases, and Transfer

- **Nightmarish Curses With Bad Luck:** In eMush, Nightmarish (0 AP) gives nightmares to a sleeping player, costing them sleep bonuses. Here it is a **2 AP covert** action on any living human roommate (in bed or not) that applies the curse **Bad Luck** for **8–16 cycles** (recursing rerolls it): the victim's action **injury and dirt chances are multiplied by 4**, and the Metal Plate and Tremor incidents always deal their **maximum** damage. **Curses** are a new kind of ailment that works like a disease but is **hidden from its holder** (even their action odds hide it); Mush see it on others in their room as a Mush-only status, never overhead.

> [!IMPORTANT]
> **Major Change — Mush Have Real, Tracked Morale:** In eMush, Mush morale is permanently locked at 14 and unaffected by food, traits, or penalties (allowing "what's your morale?" arithmetic checks). In **Mush: Evolved**, **Mush track real morale** so a Mush's morale naturally mirrors a human's:
>
> - Mush keep their current morale on conversion and gain or lose morale from **every source**: consumables (food, alien fruits, and drugs apply their morale delta to Mush even though Mush still gain 0 AP/HP/MP/buffs from them, while still adding satiety), daily morale loss, innate character traits (Raluca's **Antisocial**, Finola's **Germaphobe**), Hopeless (−1) and Pregnant (−2) crew deaths, incidents, speeches, Comfort, and Demoralizer.
> - At **0 morale**, Mush receive the private **Hopeless** status just like humans, but **never die from it**.

*(Spore extraction, Fertile's free first daily extraction, personal/daily spore caps, covert spiking with 4-cycle cooldown, same-room spore badges for Mush, Epigenetics, and Schrödinger infection work the same as in eMush.)*

| Mechanic | eMush | Mush: Evolved |
| :--- | :--- | :--- |
| **Mush as Disease Carriers** | Mush are immune to diseases and silently cure existing ones at cycle change. | Mush **catch, carry, and spread diseases** (from alien fruits, spoiled food, incidents, room spread, and comforting/intimate actions) with the same odds and delays as humans, and perform symptom log actions (vomiting, sneezing), but **suffer no stat penalties**. |
| **Body Transfer** | Deletes the victim's human skills; can target inactive players. | **Preserves the victim's human skills** (no reset trace) and **cannot target inactive players**. (In both games, private logs and private channels stay with the body.) |

### Reworked Mush Skills

*(**Demoralizer** works the same as eMush's Disheartening Contact, with only its English name changed.)*

| Mush Skill | eMush | Mush: Evolved |
| :--- | :--- | :--- |
| **Doorman** | Once per day (0 AP) on a **random** working door in the room. | Lets the Mush **choose which working door** in the room to break, with **no daily limit** (**first use each day is 0 AP**, subsequent uses cost **2 AP**). |
| **Nimble Fingers** | Grants secret camera install/remove actions only. | **0 AP instant toggle** (enter/exit Nimble mode, private status). While active, all room-level **Public** actions (including movement) become **Secret** when unwitnessed and unfilmed (staying plain Public if witnessed/filmed so Nimble mode doesn't leak). |
| **Trapper** | Living Mush see a trap icon only in their **current room**. | Living Mush see all active traps **ship-wide on the minimap** (icon and room caption). |
| **Hard-boiled** | Takes 1 off each non-critical combat hit (not expeditions), stacking with Plastenite Armor; a 1-damage hit is fully absorbed (0 damage). | Same reduction and stacking, but armor and Hard-boiled together **never reduce a hit below 1 damage**: a 1-damage hit goes through whole and no punch or weapon hit is fully absorbed. Plastenite Armor alone has the same floor of 1, including in expedition fights. |
| **Pyromaniac** | Costs **4 AP** to start a fire. | Costs **3 AP**. |

---

## 5. Research, NERON Projects, and PILGRED

### Relaying, Assays, Proposals, and BIOS

| System | eMush | Mush: Evolved |
| :--- | :--- | :--- |
| **Research & PILGRED Relaying** | Strict turn-order relay penalty (−2% per consecutive action by the same player). | **Pooled Relay Tokens:** Contributions enter a pool as tokens and are **automatically arranged** for the lowest possible repeat penalty. A player is only penalized if they hold more tokens than everyone else combined plus 1, and highest rolls are assigned to the highest bases so progress never drops. |
| **Research Samples & Assays** | Instant progress per action; no sample spoilage or sabotage. | Research tokens enter as **pending samples**. When verified + pending progress hits **25%, 50%, 75%, or 100%**, an **assay** tests all pending samples (**5% natural spoil chance**; spoiled samples are removed; verified progress never falls). A public lab log names everyone tested and whose samples spoiled, never why. **Own Spoil:** Mush can submit a pre-contaminated sample that always fails assay (recorded in action history). **Contaminate:** Saboteurs can spend **1 AP** (private) to contaminate a pending sample from the **smallest contributor** on that research. |
| **ACTOPI (BIOS Toggle)** | Off at game start; requires completing the *ACTOPI Protocol* NERON project or carrying an iTrackie 2 to see who is in each room. | **NERON BIOS toggle starting ON** from game start (everyone sees who is in which room on the minimap until toggled off); the *ACTOPI Protocol* project is removed. |
| **BIOS CPU Priority & Crew Lock** | CPU priority and Crew Lock are only visible at the BIOS terminal; Projects and Research crew locks block non-holders from accessing the terminal. | Same CPU priority bonuses (+1 analysis sector for Astronavigation; +1 base efficiency on Projects and Research; once/day per player) and Crew Lock roles (Piloting: Pilot; Projects: Designer; Research: Biologist/Medic/Polyvalent), except **CPU priority is visible ship-wide to all living players**, and **Crew Lock gates only the work/launch actions** so anyone can still open terminals to inspect progress and airborne non-pilots can still land. |

### Reworked and Rebalanced Projects & Research

*(**Floor Heating**, **Noise Reducer**, **Heuristic Targeting**, and **Quantum Sensors** match eMush.)*

| Project / Research | eMush | Mush: Evolved |
| :--- | :--- | :--- |
| **Pneumatic Dispenser** | Automatically moves garden-grown fruits to the Refectory at day change. | Reworked into **Pneumatic Tubes**: spawns **1 output tube and 2 input tubes** on the Nexus floor. Placing an input tube on a room floor lets anyone transfer items (0 AP) to a random room with an output tube on the floor. |
| **Dismantling** | Spawns **5** metal scraps in the Engine Room. | Spawns **8** metal scraps on the Engine Room floor. |
| **Scrap Heap** | Spawns **5** random items from a 14-item weighted pool across storages. | Spawns **7 specific items** distributed across the 5 storages: *thick tube, plastic scraps, 1 random skill book, 1 random gun blueprint (Rocket Launcher, Lizaro Jungle, or Old Faithful), rope, bandage, and 1 random misc item (knife, soap, hydropot, or gloves)*. |
| **Thalasso** | Replaces showers with unbreakable thalasso equipment; grants **at most one** of the three 25% bonuses per shower. | Showering as a human rolls **three independent 25% checks** for **+1 HP**, **+1 morale**, and **+2 MP**. |
| **Icarus Magnetic Return** | Returns only the empty Icarus craft when all explorers die/get lost/are stranded; planet loot is destroyed. | Jumping or leaving orbit while an expedition (Icarus or patrol ship on a planet) is away **immediately recalls the living crew and loot safely** to its bay. |
| **Magnetic Net** | BIOS toggle; recovers patrol ships on jump. | **Always active once built** (no BIOS toggle). |
| **Spatial Wave Radar** | Upgrades the antenna equipment for −1 AP on all comms actions and double Sol contact odds while unbroken. | **Unconditional passive** once built: **−1 AP** on contacting Sol and closing merchant deals, and rebel decodes take **the higher of two 1–40 rolls** instead of their average. |
| **Jukebox** | Gives a jukebox kit to build; the jukebox plays one character's song per cycle, drawn from every character aboard (dead ones too); anyone in its room at the cycle change when their song plays gets **+2 morale**. | **No kit**: the project spawns the jukebox in the **Refectory** (eMush: Alpha Bay 2). Songs come from **living** players only. The cycle-change bonus is **replaced** by a 0 AP **Listen** action, usable only while your own song plays, for **+3 morale**, **once per day** (public log naming you and the song). Check playlist (next 3 songs, private) is kept. |
| **Eden (Super Calculator, Travel to Eden)** | Reaching Eden with any Mush aboard, the cat included, is a Mush ending; a star map tree and False Eden decide where the ship lands. | **Travel to Eden is always a human win**, even with Mush alive. Compute at the Super Calculator works as in eMush (2 AP or 1 Computer point, 33% with the usual failure streak, 3 unhidden fragments on the Nexus floor, success public in the room, failure private), but the button shows disabled while fragments are short instead of hiding with none. No star map tree or False Eden yet. |
| **Launch Keys** | None: the Commander alone sends the ship to Sol or Eden. | Each title (Commander, NERON Admin, Comms Officer) has a launch key its holder inserts or removes at a working Command terminal (0 AP, public room line); a title changing hands switches its key off, and only people on the bridge see which keys are in. Return to Sol and Travel to Eden need all three keys in. The launch doesn't end the game at once: everyone off-ship dies, travel locks, and the game ends at the next cycle change with no cycle-change processing (a faster-than-light star field meanwhile). |
| **Meridon Scrambler** | 20% chance for plain **Hunters** to target any other hunter (including asteroids/transports). | Applies to **all shooting hunter types** and only targets a **random other shooting hunter** (never asteroids or merchants). |

---

## 6. Alien Fruits, Items, Injuries, and Health

- **Value-Budgeted Alien Fruits:** Replaces eMush's independent per-trait rolls. Each of the 12 alien species is generated within a **3–6 point value budget** with a grow time of **4 cycles per point (12–24 cycles, always faster than bananas' 36 cycles)**. Base **+1 AP and +1 satiety** for humans, plus budgeted extra AP (+1/+2), morale (+1/+2/+3/−2), HP (+1/+2), **0–3 timed buffs** (**Treat Disease**, **Energize**, **Resistance**, **Perception**), and **0–3 delayed diseases** (30–80% odds, arriving **2–16 cycles** after eating).
- **Graft Hybrids:** In eMush, Graft only swaps the plant for the fruit's species. Here it makes a **hybrid** of the two species: one fixed per unordered pair of the 12 alien species for the whole ship (66 possible), drawn at launch from both parents' effects (AP, morale and HP from a parent at random; each parent buff and disease kept at 50%, up to 3 each) and fitted to a **4–9 value budget**, with a grow time of 4 cycles per point capped at **32**. A pair that can't fit has no graft. Bananas and hybrids can't be grafted. A hybrid's effects are hidden like an alien species' (lore holders only), and unknown to everyone until first grafted. **Green Thumb** grafts start at **25%** of their grow time.
- **Starting Ship Items, Equipment & Hyperfreeze:**
  - The **6 spacesuits** start in the **Icarus Bay** (instead of the ship-wide random pool).
  - The **tabulator** (THE List) is a fixed item in **Front Storage**, not bridge equipment: it can't be taken, dropped, hidden, dismantled or sent by tube, and it breaks (also at a cycle change), can be sabotaged and repairs at 12%. Printing the list (0 AP, a Tracker, once per game, also never again once torn) gives **8 names less one per whole day since Mush selection** (never fewer than 1), not eMush's count of non-starting-Mush players less one every 12 hours. Its guaranteed Mush is a living starting Mush if any, else **a converted Mush, else Chun** (eMush names only a living starting Mush); the filler is living crew other than Chun only; with no Mush left it still prints, saying none are left aboard.
  - The **Hydroponics terminal** starts in the **Hydroponic Garden** (not present in eMush); while working, it protects plants in the Garden from fire, and it can break, be sabotaged, and be repaired (12%).
  - **Hyperfreeze** only targets **cooked rations and alien steaks** (never fruits) and **preserves their current spoilage stage** in place when turning them into non-perishable uncooked rations (eMush freezes fruits with a Frozen status and resets ration spoilage).

### Injuries, Surgery, and Spore Sucker

| Mechanic | eMush | Mush: Evolved |
| :--- | :--- | :--- |
| **Burnt Hand** | +1 AP on actions (exempting Move, Consume, Surgery, and Admin/immune actions). | **+1 AP surcharge applies only to actions that already cost more than 0 AP** (free actions, skill-point actions, and moves are unaffected). |
| **Third-Degree Burn (50%)** | +1 AP on actions; +10% chance to fall ill at cycle change. | +1 AP only on actions that already cost AP (moves unaffected); a **3% chance** at each cycle change to catch one of the incident diseases. |
| **Third-Degree Burn (90%)** | −4 max HP; +10% chance to fall ill; you die of sepsis if you act, at the cycle change, or if you get dirty. | −4 max HP, +1 AP on actions that cost AP, a 3% incident-disease chance per cycle; **only getting dirty** kills by sepsis. |
| **Damaged / Destroyed Ears** | Uppercases your sent messages and replaces others' messages with `"..."` while active. | **Total deafness to other players' messages** across all channels while injured: missed messages are **permanently omitted** from your view (even after surgery) and trigger **no unread badges, chips, or notifications**. Your own messages are not uppercased. |
| **Retro-Fungal Serum Coma** | **No coma**: cures a Mush and removes their human skills immediately (no coma on humans or Mush). | Vaccinating **any** target (human or Mush, cured or not) puts them into a **2-cycle coma** with **total blindness** (room and ship-wide view hidden until it ends), blocking all actions except marking ready, keeping inventory and bed AP gain, clearing active stances/queue, resetting inactivity, and **permanently omitting** all logs and chat (including system messages) written during the coma. |
| **Spore Sucker** | Blocks Chun; different log for Mush; applies a 4-cycle cooldown status (not curable by surgery). | **1 AP**, reusable: removes 1 contamination from a human (Chun allowed; neutral private log), deals **3 HP damage**, and inflicts a **4-cycle Stiff Neck injury** (prevents lying down, gets you out of bed, acts as cooldown, and **is curable by surgery**). |
| **Surgery & Sepsis** | **Medic-only**, requires the patient to be **lying down**; failure inflicts permanent **Sepsis** (−4 HP/cycle until cured with 2 heal actions). | Anyone at a working Surgery Pod (or a Medic with a Medikit) can operate on **any injured patient** (no lying-down requirement; **2 AP on others / 4 AP on self** or 1 Nurse care point). **Failure inflicts Sepsis (1–3 cycles):** **−6 HP immediately**, then **−4 HP and −1 morale per cycle**. |

---

## 7. Space, Navigation, Expeditions, Drones, and Merchants

| Mechanic | eMush | Mush: Evolved |
| :--- | :--- | :--- |
| **Activity Overload (Hunter & Incident Points)** | Each cycle's hunter and incident points are multiplied by every boarded player (dead included) ÷ max players while the day's AP spent is at most 7 × max players, else by AP spent ÷ that threshold; only real AP counts. | Same formula and threshold (7 × the ship's 16 seats), but the low-activity share counts **only living players**, and an action paid with a **skill point counts the AP it would have cost**. |
| **Following Hunters on Jump** | Following plain Hunters unpool on arrival (spending pool points, or spawning at least 1 hunter from half the pool if 0 plain hunters were present). | Following hunters (half of plain Hunters and Aracks rounded up, plus all Trax) resolve at departure without spending pool points; jumping with **0 hunters present brings 0 hunters**. |
| **Visual Starfield Turns & Orbited Planet Name** | Ship turns are announced ship-wide by NERON, while the orbited planet's name is only shown at consoles. | Everyone aboard sees the **starfield rotate** on every quarter-turn and sees the **orbited planet's name** in the HUD once arrived (sectors and finder remain private). |
| **Plasma Shield & Damage Split** | Shield is inactive until the Plasma Shield project completes; when active, absorbs 100% of hunter damage up to current shield (0% of asteroids). | Shield starts **broken at 0/100** with its BIOS switch **off**, and can be repaired and switched on before the Plasma Shield project completes (+5/cycle when repaired and on). When active, it **splits every hit** (including asteroids), absorbing **33% base** or **67% with the Plasma Shield project** (rounded to the nearest integer). |
| **Expeditions — Boarding & Instant Landing** | Launching picks up to 4 random living players in the Icarus Bay; Landing resolves on the first exploration step. | Players explicitly **Board** (free, checks spacesuit on airless planets) and **Leave** (free) the docked Icarus; the launcher then takes off with everyone aboard. Boarded players **stay in the Icarus Bay** until takeoff, still reachable there; a public aggressive action on one puts them off the Icarus. The **Landing event resolves immediately at takeoff**, followed by 1 sector every **10 real minutes**. |
| **Support Drones** | Consume electric charges; failure streaks persist across repairs; carried drones stay in inventory; repair equipment/doors only. | **No battery/electric charges**; **failure streak counters reset** on a successful repair or extinguish; also repair broken floor items; a carried drone **leaves the carrier's inventory onto the floor** to move when nothing is repairable in the room. |
| **Hostile NPCs** | No hostile creature aboard the ship (creatures exist only on expeditions). | Hostile creatures can be aboard the ship: HP, AP and MP like a player's, a turn at each cycle change, Move and Punch as their actions (the intruder punches a player in its room once a cycle, or moves; Pacifist, Bodyguard, Elusive, Ceasefire and guardians weigh on them as on players), and targetable by Punch, Attack and Throw Out. Currently only spawned by the Superkube. |
| **Merchant Ships (Transport)** | Human officers can only trade 48h-AFK crew anywhere or 24h-AFK crew in Storage (Mush officers can trade active crew in Storage); blocked while hunters attack; Techno Rewrite deactivates random finished projects; NERON announces departure when an attacked merchant flees at cycle change. | Any officer can trade **any 24h+ Inactive crewmate from anywhere** (never active crew); trading is **allowed during hunter attacks**; **Techno Rewrite** lets the officer choose which finished ongoing-effect projects to trade away (**lost for good**); and **shooting a merchant** requires confirmation, closes its conversation, and flees at the next cycle change (or drops wreckage at 0 HP) with **no public NERON announcement**. |
| **Xyloph Printing & Finola's Lost Analysis** | Xyloph items/documents queue in the Tabulatrix printer; Finola's Lost Analysis always marks Chun negative. | Xyloph items/documents spawn **directly on the Bridge floor** (no Tabulatrix). **Chun is rolled like any other non-Mush character** in Finola's Lost Analysis (2.5 × starting Mush, rounded down, non-Mush bodies marked negative at Mush selection). |
