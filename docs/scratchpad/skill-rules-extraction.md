# Skill rules extracted from eMushpedia (for future implementation)

Extracted 2026-10-24 from the French eMush wiki (`npm run wiki -- page <title>`; one page per skill, hubs `Compétences humaines` and `Compétences Mush`) and from `Mush/derived/data/Data/skills.json` (the original's ids). Summaries are in English; page titles are given so each entry can be re-read.

## Read this first

- **Nothing here is decided.** The wiki describes eMush (the remake, v0.24 to v0.26), not this game. Per CLAUDE.md, every item needs the owner's answer before it becomes a rule (use the `rule` skill; record answers in `docs/rules-design.md`). "Wiki says" below is a suggestion.
- Values the wiki marks as uncertain are flagged **(wiki guess)**. Values it cites from eMush source or Discord devs are flagged **(source)**.
- **Status** column: `none` = no rules in the repo yet, `partial`/`full` = from `SKILL_STATUS` in `shared/src/skills.ts` (checked 2026-10-24). Skills already `full` are listed only briefly, with anything the wiki says that our implementation may lack.
- **Hidden-information warning for the implementer:** many Mush skills create private or stealth effects. Each needs `viewFor` and log-visibility handling, and a `leak-check` pass.
- Most "bonus for NERON projects" lines are out of scope (owner, 2026-10-16: project bonuses are left out of the implementation count). The project lists are kept below only for reference.

## Cross-cutting mechanics the skills rely on

Several skills need systems the repo does not have. Group the work by system.

| System | Used by | Repo state |
|---|---|---|
| Action visibility levels: **public** (everyone in the room and cameras see it), **discreet** (seen by people present, not by cameras), **stealth/"furtive"** (seen by nobody unless revealed), **private** (log only to actor) | all Mush skills | check `docs/implemented-rules.md` for what exists |
| **Reveal** of stealth actions (Observer 25%, Hunch/Confidant/Torturer replay of past actions, cameras) | Observateur, Pressentiment, Confident, Bourreau | not built |
| **Mycoalarms** ring on certain Mush actions | Bacterophilie, Cuisine fongique, Infecteur, Piégeur, Piratage radio, Cauchemardesque, Transfert | not built |
| **Dirty** status, accidental dirtiness, "very dirtying" actions | Méticuleuse (done), Expert (done), Moisification, Piège moisi, Fertile | partial |
| **Special point pools** per day: Tech (engineer), Garden, Cook, Shoot, IT (computer), Neron (designer), Heal, PILGRED | several | Heal, Computer, Designer, PILGRED exist; Tech, Garden (partial), Cook, Shoot do not |
| **Aggressive action** flag (blocked by Ian's Pacifist status, taxed by Bodyguard, blocked by ceasefire) | Bourreau, Cauchemardesque, Contact déprimant, Infecteur, Bacterophilie, Persécuteur, Transfert, Lutteur/Robuste attacks | `pacifist.ts` exists |
| **Spores** carried by Mush (extract, spend) | Fertile, Esprit du Mycélium, Phagocytose, Piégeur, Cuisine fongique, Moisification, Transfert | `extract_spore.ts` exists |
| **Equipment breakdown** (sabotage, random failure, NERON announcements) | Gelée verte, Saboteur, Portier, Technicien | not built |
| **Fire** | Pyromane, Pompier | check |
| **Expeditions / planets / sectors** | Astrophysicien, Botaniste, Diplomatie, Pilote, Sprinter, Survie, Tireur, Traqueur, Retour arrière, Traître | not built; defer |
| **Hunters / space combat** | Stratéguerre, Canonnier, Fantassin, Pilote, Tireur | see `docs/space-combat-plan.md` |
| **Private channels, iTrackie, communications** | Piratage radio, Polymathe | `comms-plan.md` |
| **Titles** (Commander, Comms Officer, NERON Admin) | Arriviste, Politicien | `titles.ts` exists |
| **Per-game "unique" use that survives transfer/vaccination** | Génie, Politicien, Diplomatie ceasefire, Apprentissage | needs a persistent per-character `usedOnce` flag, not per-skill |
| **Skill slots** | Epigénétique, Apprentissage, Transfert | `SKILL_SLOTS` = 3 human plus book slot; Mush slot count is open (see questions) |

### Daily and cycle timing

- Eight cycles per day; "per day" resets happen at the day boundary. Daily resets happen at cycle 1, which is why the wiki notes Infecteur can punch three times in two minutes around midnight.
- When a skill is picked, the player receives the **maximum** of its special points at once (the wiki says "2 Tech, 2 Garden and 2 Cook" for the three-pool skill), not just the daily increment.

## Human skills

Ids are the original's (`CONCEPTOR` becomes `designer` in our code). Characters are who starts with it in eMush, for reference only (our characters will get their own sets later).

### Already `full` in the repo (check only the gaps)

| Skill (id) | Wiki rule | Gap or note |
|---|---|---|
| Caféinomane (`caffeinomaniac`) | +2 AP when consuming a coffee. | Wiki: also boosts the Fission Roaster project only (out of scope). |
| Parfum antique (`antic_perfume`) | Each shower grants 2 cycles of immunity to Mush infection. | If the owner is Mush, the immune status is gained but has no effect. Check ours matches. |
| Logistique (`logistics`) | Each cycle, 1 AP to a random roommate, never yourself; ignores "Grand Inactif" characters. | Inactive-player rule: ours has no inactivity yet. |
| Méticuleuse (`stickler`) | Never get dirty by accident from an action. | "Super dirtying" actions still dirty you. |
| Créatif (`creative`) | A failed action has 50% to refund 1 AP. | Wiki also says a failed shot or repair point can become a general AP. |
| Expert (`expert`) | Success, injury and dirt chances are all multiplied by 1.2, with injury rounded down (4% becomes 4%, not 4.8). The multiplier applies even to guaranteed actions, where only the injury and dirt chances get worse. | Check rounding. |
| Physicien (`physicist`) | 1 PILGRED point per day; PILGRED repair bonus. | Project bonus list out of scope. |
| Concepteur / Designer (`designer`) | +2 Neron points per day, spent only on NERON projects. | Efficiency bonus applies to only two projects. |
| Leader (`leadership`), Motivateur (`motivator`) | Fiery speech (2 AP, +2 morale to roommates, no daily limit, not the speaker). Boring speech (2 AP, daily, +3 MP to roommates). | Done. |
| Expert radio (`radio_expert`), Rebelle (`rebel`) | See `comms-plan.md`. Rebelle doubles decode progress; Xyloph contact multiplies it once more. | Wiki: base decode roll is 1 to 40% (triangular); doubled is 2 to 80%; with Kivanç contact 4 to 160%. |
| Persécuteur (`juge`) | 1 AP, private, aggressive, same room: target becomes Outcast (public status). Outcast gets -20% action success, and their stealth actions become discreet. Lasts while the persecutor lives, or until the outcast dies or goes inactive. | Done per `SKILL_STATUS`. |

### Partial

| Skill (id) | Wiki rule | Missing |
|---|---|---|
| Médecin (`medic`) | Heals give +2 HP; can perform **Operations** (cures injuries of a **lying-down** target, in sick bay or with a medikit; target need not be missing HP; unavailable if no injury); can read medicine properties; +4% on every lab research contribution. | Operations, medicine properties, research bonus. Needs the injury system. |
| Infirmier (`first_aid`) | +2 heal points per day; read medicine properties; Thalasso project bonus only. | Medicine properties. |
| Robuste (`sturdy`) | Melee punches can do +1 damage (1 to 4 total); no penalty for heavy items; **Throw Out** (see below). Knife attacks do not get the bonus. | Throw Out. |
| Informaticien (`computer`) | +2 IT per day; IT replaces AP at: Com center (update NERON, contact Xyloph, establish comms, decode rebel), Astro terminal (**Analyze** only, not scan), supercomputer (Calculate), lab (research), Nexus (projects); doubles success chances with the Tinkerer (Bidouilleur) item. | Hacking / Bidouilleur. |
| Technicien (`engineer`) | +1 Tech per day; **Dismantle** and **Reinforce** (armor up) objects; doubled success for repairing objects, equipment and **renovating** ships; project and PILGRED bonus. | Everything but PILGRED. Details below. |
| Sprinter (`sprint`) | +2 MP per AP-to-MP conversion (not stacking with the Scooter). Expedition: +1 section visited, stacks across Sprinters. | Expedition part. |
| Botaniste (`botanic`) | Read plant and fruit properties; +2 Garden per day; **Grafting** (not for Polyvalent); expedition Harvest event gives +1 fruit. | Grafting, fruit properties. |
| Polyvalent (`skilful`) | Counts as Botanist, Diplomat and Biologist for passive effects only (reads medicine, plants, fruits; +4% lab; Combat event blocked on expeditions; Harvest +1 fruit; trade options). No Garden points, no grafting, no ceasefire. Cannot read Biologist/Botanist/Diplomat skill books. | Everything except plant sickness. |

### Not implemented (status `none`)

Each entry gives the wiki rule, then follow-up edge cases. Ids not in `SKILLS` are marked.

**Abnégation (`abnegation`)**: If morale reaches 0 you do not die; you lose 1 HP per cycle instead. Wiki note: in theory this buys about 14 cycles of survival, and low morale raises disease risk. No Mush effect. (Janice's)

**Apprentissage (`apprentice`)**: Grants an action that copies **one skill of a roommate**, once per game. The copied skill **replaces** Apprentissage (permanent, no undo). The wiki says Stephen can reuse it only through a skill book. Related: `read_book` exists. Copying a skill that grants items (Paranoid camera, Robotics plan, Green Thumb pots) hands out the items again.

**Astrophysicien (`astrophysician`)**: Scanning a new planet costs 1 AP less; analyzing a planet reveals one more section per analysis; NERON project bonus. Needs the astro terminal (see `docs/astro-plan.md`).

**Biologiste (`biologist`)**: Reads medicine properties; +4% on each lab research contribution; project bonus. The lab exists (`research.ts`), so the +4% is likely easy: a research-contribution modifier.

**Bourreau (`torturer`)**: Costs 1 Torture point (+1 Torture point per day, max 2). Aggressive. Target loses 1 HP (guaranteed, ignores armor and Tough), then the torturer sees the target's last X actions, where X = target's **missing** HP. The log line is unlogged (undeletable by Dialoguiste). Blocked by Pacifist; the wiki also says "Crazy Eye" which the wiki replaced with Bodyguard.

**Canonnier (`gunner`)**: Doubles damage and doubles hit chance on turret shots. Damage doubled after rolled (2/3/4 becomes 4/6/8). Needs turrets and hunters.

**Concepteur (`designer`)**: done, see above.

**Confident (`confident`)**: Once per day per target, a roommate can confide (1 AP, paid by the confider). The confidant sees the confider's last X actions, where X = **the confidant's current morale**; the confider gets +2 morale. The confider cannot see which actions were revealed, so cannot read the confidant's morale. The daily limit is per confider across all confidants.

**Cuistot (`cook`)**: +4 Cook points per day; reads ration and fruit properties (not medicines); only the Cuisine SNC project, which is useless, so no project bonus is needed. Needs the Cook point pool (free cooking actions).

**Dévotion (`devoted`)**: +3 AP when accepting a Commander mission (so 6 total with the base 3). Excess over the AP cap (7 in the wiki) is wasted. Needs Commander missions.

**Détaché (`unconcerned`)**: No morale loss when a crewmate dies; no psychological-disease risk from witnessing a death. No Mush effect.

**Diplomatie (`diplomacy`)**: Expedition: prevents the Combat event on listed sectors (wreck, ruins, intelligent life, insects, ruminants, predators, Mankarog, crystalite); opens trade; **Ceasefire** once per character per game, public, lasts 3 cycles, blocks all aggressive actions and Throw Out, but only **in the diplomat's room** (ends immediately if they leave; does not end if they die, lose the skill, or get vaccinated, per a dev on Discord **(source)**). Transfer does not give the new body another use. Polyvalent does not get the ceasefire.

**Fantassin (`daunting`, formerly Intimidant)**: Doubles turret hit chance; +1 Shoot per day; starts with a customised Blaster biocoded to the owner (cannot be shot by others, dismantled, hidden, or taken while the owner lives, but can be sabotaged). Note our id is `daunting` (Intimidant); the wiki's v0.26 replaced it with Fantassin. Needs an owner decision on which description applies.

**Fuyant (`escape`)**: Melee attacks against you get a x0.75 success multiplier (punch and knife, not firearms: 60% becomes 45%); you can move even while someone is Guarding the room. Needs Guard (the `GUARD` action in the original).

**Garde du corps (`crazy_eye`, id kept, replaced Oeil fou in v0.25.1)**: 1 AP, public, **Protect** one crewmate (the VIP). While both are in the same room, every aggressive action against the VIP costs **+2 AP**, including by the bodyguard themselves. Both get a public status showing who protects whom; it persists until the bodyguard chooses someone else and survives movement; protection is active only while together (reapplies when they reunite); ends when either dies; two bodyguards cannot protect the same target; stacks with Pacifist. Public log on activation.

**Génie (`genius`)**: Once per game, an action ("stroke of genius") that completes a research, project or repair outright. Not usable on PILGRED. The player gains a private status "Coup de Génie" and the next contribution is 100%. Single use per character, even through Transfer or vaccination.

**Hygiéniste (`strong_skin`)**: 50% chance to resist each Mush contamination; 50% resistance to physical diseases; also 50% to resist all spores in a fungal-cooking-trapped food (all or nothing). Wiki lists it as "lost" on becoming Mush.

**Léthargie / lethargy (id `LETHARGY`, not in `SKILLS`, flagged not retained in the original's table)**: Lying down 4+ cycles gives +1 extra AP per cycle, lost on standing; **doubles the AP cap** (max 24). Any standing up resets the counter. Eg lying at 0 AP at cycle 1: 8 AP by cycle 5, then +3 per cycle, up to 23 by cycle 2 of the next day.

**Lutteur (`wrestler`)**: Melee punches can do up to +2 damage (1 to 5 total) unless you are Mush (so "not mutated"); knife excluded; grants **Throw Out**.

**Main verte (`green_thumb`)**: Two extra hydropots in inventory when picked (again if re-picked or copied); grafts you plant start at age 1 (one cycle faster to mature). No grafting itself.

**Métalo / Recycleur (`metaliciste`)**: Once per day per **storage room**, free (0 AP), automatic success, "scavenge": result weights Metal scrap 4, Plastic scrap 3, Standard ration 1, Fuel capsule 1, Oxygen capsule 1. Renamed Recycler in eMush v0.26.

**Observateur (`observant`)**: Search costs 1 AP less; 25% to reveal stealth actions done in your presence (adds a public "noticed something interesting" log line and the action becomes revealed). When Mush, the observer's own stealth actions are never revealed by themselves, but a teammate's are.

**Paranoïaque (`paranoid`)**: Starts with +1 camera; installing and removing cameras costs 0 AP; project bonus. A second pick or copy gives another camera. When Mush with Doigts de fée, the same actions are also free.

**Persévérant (`persistent`)**: After a failed action the success chance multiplier is x1.5 instead of the usual x1.25 (decimal part kept, roll rounds down). The usual +25% rule ("failed action improves the next attempt") is a prerequisite.

**Pilote (`pilot`)**: Doubles patrol-ship shot chance; never fails landing or takeoff (including expeditions); the crew lock set to Pilot in the BIOS requires a pilot to take off; project bonus. Expedition: presence guarantees safe landing.

**Pompier (`fireman`)**: Extinguishing with an extinguisher always succeeds; can try to put out a fire manually with no extinguisher (25% success rising on each failure; 50% chance to take 2 damage each use, even on failure; failure private, success public); bonus on sprinkler and fire-detector projects.

**Pressentiment (`premonition`)**: Costs **1 morale**; see one crewmate's most recent action (only one, despite the description). Useless on a lying-down target (last action is Lie Down). The log of this use is unlogged.

**Psy (`shrink`)**: Each cycle, +1 morale to every character lying down in the room (works even if the shrink lies down; also passively cures psychological diseases, possibly not on the first try); **Comfort** action: 1 AP, +2 morale to a crewmate, no daily limit, wasted silently if target is full; Participation de NERON project bonus.

**Robotique (`robotics`)**: Starts with a Drone Plan; can upgrade drones (2 metal scrap per upgrade; Pilot, Firefighter, Turbo, Sensor); project bonus on several. A second pick gives another plan. Needs drones.

**Seule amie de NERON (`neron_only_friend`)**: Every NERON project contribution is maximized for everyone (min raised to max). Needs project contributions with a range.

**Stratéguerre (`space_tactics`)**: Each cycle 50% to activate; if it does, (a) hunters chasing after a move are reduced by 33% (after the move's own reduction) and (b) the next hunter wave is 33% smaller in spawn points; unspent points stay banked. Rounds hunter points up. Private log when it triggers. Wiki attributes the explanation to a dev **(source)**. Needs hunters.

**Survie (`survival`)**: Expedition only: each personal damage is reduced by 1; Provisions event gives +1 steak; the last to die on a fatal event.

**Tireur (`gunman`)**: +2 Shoot per day; Expedition: +1 team strength in combat if you hold a firearm; project bonus; with firearms, doubles the weight of critical successes and of non-critical failures (so more crits, fewer critical failures). Wiki example weights: Sulfateuse critical goes from 15/90 to 30/105; its critical failure from 4/79 to 4/154.

**Technicien (`engineer`) details**: Reinforce ("Blinder") an item costs 1 metal scrap per try, even on failure, and prevents sabotage and dismantling (not random breakdown); Dismantle yields components; Repair objects/equipment; Reinforce also restores hull armor; Renovate ships costs 1 metal scrap per try even on failure (drones can repair ships for free, so players are told to use drones). Tech points also allow installing and removing cameras.

**Traqueur (`hunt`)**: Log history of 16 cycles instead of 8; sees from/to rooms in movement logs; sees which ships were used for takeoff/landing; **once per game** prints the secret **List** at the tabulator (a list of people that contains at least one infected Mush; exact composition not given on the page; see `LA Liste`); expedition: blocks the Death event on the Lost section, only if the tracker is on the team.

**Politicien (`politician`)**: Once per game, 3 AP, Nexus, NERON core working: **Putsch**: at the next cycle the politician becomes first in line for Commander. If they die or go inactive, the order resumes. Last putsch wins if several. Use per character is single even through Transfer. See `titles.ts`.

**Polymathe (`polymath`)**: +2 private channels; +1 IT per day (about 2 AP). No action penalties (removed after v0.25).

**Rêveur / Oisif (`oisif`)**: no wiki page found. Our id `oisif` maps to the original's "Rêveur"/"Snob" row. Ask the owner what this skill does.

**Retour arrière (`fast_backward`)**: Expedition: see the next sector; 2 AP to return to the Daedalus in an emergency (usable during landing; not if Lost). The skipped step is reshuffled into the remaining ones if you go again.

**Seul espoir de l'humanité (`mankind_only_hope`)**: removed as a skill in eMush; Chun's trait here. Done.

### Extra human skills the repo does not list (original `retained: false`, but eMush still has them)

These ids are not in `SKILLS`. The owner must decide whether to add them.

| Skill | Wiki rule |
|---|---|
| Agent de maintenance | Each day +1 Tech, +1 Garden, +1 Cook; picking gives 2 each. Replaced "Seul espoir" for Chun in v0.25.1. |
| Arriviste (`OPPORTUNIST`) | +5 AP the first time you gain each title (max 15 AP over the three titles). Only triggers when everyone ahead in line is inactive or dead. |
| Frugivore (`FRUGIVORE`) | +2 AP when eating an alien fruit, +1 AP for a banana. |
| Mycologiste (`MYCOLOGIST`) | Can cure fungal infections at sick bay or with a medikit; each heal removes 1 spore. |
| Optimiste (`OPTIMISTIC`) | Lose 1 less morale at the daily change. Wiki: base daily loss is 2 for all humans; Chun's trait cuts it by 1 (our `mankindOnlyHope`). |
| Panique (`PANIC`) | +1 AP and +1 MP each cycle while Mush strictly outnumber half the living crew (16 alive: 9 Mush, 14-15: 8, 12-13: 7, 10-11: 6, 8-9: 5, 6-7: 4, 4-5: 3, 3: 2). |
| Sang-froid (`COLD_BLOOD`) | +3 AP each time a crewmate dies. |
| Léthargie | see above. |

### Shared rule: Throw Out (Mettre à la porte)

Granted by Robuste and Lutteur. Not aggressive. Moves a **random adjacent-room** target out of your room (does not move you). Costs 2 AP, or 1 AP if the target is inactive. Blocked during a ceasefire. The Robuste page says a guarding player can still be thrown out; the Lutteur page is silent on that. Clarify.

## Mush skills

None are in the repo. Original ids are shown (these are the `mush: true` rows). **Slot rules** need an owner decision (see questions). In eMush, a Mush picks from this list on conversion; the wiki says a Mush has **4 total skill slots** (3 human plus the Mush one, deduced from "reset 3 of 4 slots" on Epigénétique) **(wiki guess)**.

| Skill (id) | Cost | Visibility | Rule |
|---|---|---|---|
| Infecteur (`INFECTIOUS_AGENT`) | passive | n/a | One extra **Infect** (punch) per day. The action: 1 AP, stealth, rings Mycoalarms, does not dirty, counts as aggressive. The per-day limit resets at cycle 1. Base is 1 punch/day, so total 2. |
| Esprit du Mycélium (`MYCELLIUM_SPIRIT`) | passive | n/a | While alive, Mush can extract 1 more spore per day. Stacks per Mush that holds it. |
| Fertile (`FERTILE`) | free | discreet, not alarmed | Once a day extract one spore free of AP cost. Extraction always dirties and is discreet and does not ring Mycoalarms. Tied to the character, so Transfer keeps it. |
| Cuisine fongique (`FUNGUS_COOK`) | 1 AP + 1 spore | private; rings Mycoalarms | Make a trapped food by mixing a spore into a consumable. Several spores allowed in one food. 3 spores (4 if a certain research was done) convert on eating. Cooking or hyperfreezing destroys the spores. The conversion happens before the food's effects: no benefits and no diseases, private log "you eat this pitiful food to keep up appearances". Hygienist: 50% to resist all, 50% to receive all. Does not dirty. Not free with Cook points. |
| Piégeur (`TRAPPER`) | 1 AP + 1 spore | discreet; Mycoalarm-detectable | Trap a room (not an already trapped one). Triggers on: standing up (voluntary), any interaction with an object on the shelf, equipment or doors of the room, fire and breakdown reports. Does not trigger on: moving out, involuntary standing up, interacting with an item already in inventory, dropping. Infects the triggerer; if Mush (even the trapper) or immune, the spore is lost. Trapped rooms show a Mush-only icon. |
| Contact déprimant (`DISHEARTENING_CONTACT`) | 2 AP | stealth + aggressive | Target loses 2 morale. The victim sees a private "you lose 2 morale" (a possible clue). Revealed log: a crewmate approaches, then the victim looks drawn. Death by depression does not lower crew morale. |
| Ninja (`NINJA`) | free toggles | invisible toggles | "Become a ninja" / "Become ordinary": free, including in bed without standing. In ninja mode, your **public** actions show "Someone" instead of your name; Stand Up and Lie Down become private; discreet and stealth actions still reveal your identity. Toggling cannot be revealed by Torturer/Confidant. Wheelchair push logs are hidden while ninja. NERON public messages (shower removal, PILGRED completion, breakdown reports) may still reveal you. |
| Traître (`TRAITOR`) | free | private | Expedition: see the next sector; once per expedition, sabotage the next sector (guarantees a negative event). Not if Lost. First draw only, a diplomat on the team can cancel it. Applies even if the team is stuck in the Icarus. |
| Anonyme (`ANONYMOUS`) | passive | n/a | You appear as **Human** in the crew bar until you die. Does not escape the Tracker's List. Your corpse is identified as Mush. Used on a last punch so the Mush count looks right, or by a freshly contaminated "Beta" Mush to hide an appearance. |
| Dialoguiste (`DEFACER`) | 2 AP, daily | always private | Erase **all logs** of the current room; no new logs appear until the next cycle starts. A death in an erased room is not announced. Revealable by Hunch, Confidant or Torturer afterwards. |
| Doigts de fée (`NIMBLE_FINGERS`) | 0 | discreet | Install and remove cameras discreetly with no chance to get dirty. Public install still allowed (may dirty). Cameras do not reveal their own manipulation. A revealed manipulation proves this skill. Free with Paranoid. |
| Piratage radio (`RADIO_PIRACY`) | 3 AP | stealth; may ring Mycoalarms | Break a crewmate's iTrackie (same room required) and speak as them while they cannot repair it; their channels show red. The victim can still talk from the bridge. Cannot impersonate NERON. Closing a victim's private channel does nothing except log the pirate's name. The wiki itself says this skill is **buggy and not recommended** per the devs **(source)**, with open "quid" notes. Defer. |
| Résistance à l'eau (`WATER_RESISTANT`) | passive | n/a | Showering costs no HP (normally Mush lose 3 to 4 HP); showering without Soap costs 1 AP instead of 2; with Soap always 1. |
| Transfert (`TRANSFERT`) | free | private; rings Mycoalarms; counts as aggressive | **Once per game.** Swap bodies with a living **human** carrying at least one spore (you cannot swap into a Mush). Triumph, AP, MP, HP and morale stay with the **character** (the body). Both players' human skills are reset to zero; Mush skills are not reset (single-use ones stay used). Spores are removed from both. Private channels are not closed. |
| Phagocytose (`PHAGOCYTOSIS`) | 0 AP + 1 spore | private | Eat one spore in reserve: +4 AP and +4 HP (wasted past the cap). |
| Epigénétique (id not in the original table) | 2 AP, once | private + confirmation | **Beta feature in eMush.** Reset your Mush skill picks (not itself). Used to drop Anonymous so humans think there was one more contamination. |
| Bacterophilie (`BACTERIAL_CONTACT`) | 1 AP | stealth; rings Mycoalarms; aggressive | Give a crewmate a disease that appears in 1 to 4 cycles. Weighted pick (source): cold 50, flu 20, fungal infection 10, extreme tinnitus 10 (of 90). Only humans can get sick, so this can clear suspects. Revealed log: "X blows a strange cloud over Y". |
| Cauchemardesque (`NIGHTMARE`) | 0 AP | stealth; Mycoalarms | Give a lying-down player nightmares: they lose sleep bonuses. Interrupted by standing and lying again. Aggressive. |
| Conspirateur (`NERON_ACCESS`) | 0 | discreet | Access NERON's BIOS without being the NERON Admin. (Normal access is public; hacking via the Tinkerer is private.) |
| Dépression de NERON (`NERONDEPRESS`) | 3 AP | discreet | Next cycle change, NERON's BIOS settings are randomized (always at cycle change, unlike BIOS edits which are instant). The DMZ restriction cannot be changed if active, and always changes if inactive, so afterwards it is always active. Log: "X seems deep in discussion with NERON". |
| Gelée verte (`ELECTRO_SLIME`) | 1 AP | stealth | Break an electronic item/equipment, effective in 1 to 4 cycles; NERON always announces it. Two lists: things that can also break randomly (comms terminal, NERON core, auxiliary terminal, lab, supercomputer, BIOS terminal, planet scanner, camera, coffee machine, mycoscan, turret, surgical plot, distiller, jukebox, dynarcade) and things that cannot break otherwise (tinkerer, holo-TV, scooter, wave scope, blaster, Natamy, sulfateuse, Lizaro Jungle, rocket launcher, spore sucker, mycoalarm, tabulator, drone). Cameras do not detect their own slime. |
| Moisification de masse (`MASSGGEDON`) | 2 AP + 2 spores | discreet | **Once per game.** Every crew member loses 2 AP and becomes dirty. The user and other Mush become dirty but lose no AP. |
| Piège moisi (`SLIMETRAP`) | 1 AP | stealth | The target becomes dirty in 1 to 4 cycles. Private log "you slimed X". |
| Portier (`DOORMAN`) | 0 AP, daily | discreet | Sabotage one **random door** in the room. 100% success and cannot hurt you (normal door sabotage is 25%). Some doors cannot break normally, so a sabotaged one proves this skill. |
| Pyromane (`PYROMANE`) | 4 AP | discreet | Start a fire in the current room; it ignites at the **next cycle change**, then behaves normally. |
| Saboteur (`SAPPER`) | passive | n/a | Triples equipment sabotage success. Sabotage costs 1 AP and is discreet. Cannot sabotage equipment reinforced with scrap. Cameras do not reveal their own sabotage. |
| Dur-à-cuire (`TOUGH`) | passive | n/a | Every combat damage you take is reduced by 1 (except in expeditions; does not reduce critical damage). Stacks with armor. |

## Suggested questions for the owner before implementing

1. **Scope:** is any Mush skill in the MVP at all? The slice has hidden-role play but there are no Mush skills in code. Many require stealth/visibility and Mycoalarms first. Recommend picking a first batch with no new systems: Fertile, Phagocytose, Résistance à l'eau, Dur-à-cuire, Anonyme, Esprit du Mycélium, Contact déprimant.
2. **Mush slots:** how many skill slots does a Mush get, and are they separate from the three human slots? When converted, do human skills stay (current code: yes, per `implemented-rules.md`)?
3. **Which skill is Fantassin versus Intimidant** (`daunting`) and Garde du corps versus Oeil fou (`crazy_eye`)? Our ids follow the old names; the wiki follows eMush v0.25 to v0.26.
4. **`oisif`** has no wiki match. What should it do?
5. Add the `retained: false` skills (Agent de maintenance, Arriviste, Frugivore, Mycologiste, Optimiste, Panique, Sang-froid, Léthargie)?
6. **Throw Out** (Robuste/Lutteur): add a shared action now? It needs a room-adjacency choice and the ceasefire from Diplomatie.
7. **Single-use tracking:** one flag per character that survives skill loss, copy and (eventually) Transfert. Confirm this model, since it affects Génie, Politicien, Diplomatie, Moisification, Transfert, Traqueur's List and Épigénétique.
8. **Injuries, diseases, fire, equipment breakdown:** many skills (Médecin, Pompier, Technicien, Hygiéniste, Gelée verte, Saboteur, Portier, Pyromane, Bacterophilie) depend on systems not in the repo. Suggest each gets its own plan doc before its skills.
9. **Reveal system:** one design that covers Observateur, Pressentiment, Confident, Bourreau and camera reveal.

## Suggested implementation order (by dependency)

1. Pure modifiers, no new state: Détaché, Optimiste, Sang-froid, Abnégation, Persévérant, Fuyant, Hygiéniste, Biologiste (+4% research), Psy passive, Tireur (once shooting exists), Dur-à-cuire, Résistance à l'eau.
2. Small new state: Léthargie, Dévotion (Commander missions), Arriviste (titles), Polymathe, Politicien, Frugivore, Panique, Métalo, Observateur (search discount), Pressentiment.
3. Actions on other players: Psy Comfort, Confident, Garde du corps, Bourreau, Contact déprimant, Phagocytose, Fertile, Transfert, Apprentissage.
4. Visibility and reveal infrastructure, then stealth Mush skills (Ninja, Dialoguiste, Anonyme, Infecteur, Piégeur, Cuisine fongique, Doigts de fée, Cauchemardesque, Conspirateur).
5. Equipment, fire, disease and injury systems, then their skills.
6. Expeditions, hunters, patrol ships, drones, then the remaining skills.

## Sources

All from https://emushpedia.miraheze.org, one page per skill title (French), plus the hubs `Compétences humaines` and `Compétences Mush`. Where a page cites eMush source commits or dev statements on Discord, that is marked **(source)**. Original ids from `Mush/derived/data/Data/skills.json`. Wiki text is CC BY-SA; this file paraphrases it.
