# Botany: what the original gives us, and a plan (draft)

Status: **draft, 2026-10-22. Nothing is built.** Owner direction (2026-10-22): mechanics and actions first; alien species and fruits wait for expeditions; plant sickness is visible only to Botanists (see "Owner direction" below). Everything under "What the original gives us" comes from `Mush/` (Motion Twin's data tables and shared Haxe code) and is reference only. "What the eMush wiki says" is a second, weaker source: the French eMushpedia, which describes Eternaltwin's remake (not the original) and is partly out of date. Neither source makes anything a rule. A rule exists once the owner answers the open questions and the answer goes into `docs/rules-design.md`.

## Why it matters

The Hydroponic Garden is the Daedalus's only renewable source of **oxygen** and **food**. Oxygen is already built (`shared/src/ship.ts`: 30 of 32 at the start, -1 per cycle, someone dies each cycle at 0), but nothing refills it, so every ship currently suffocates around day 4. Food is built (rations, cooking, hunger), but the supply is fixed. Botany is what makes long games possible. It is also a hidden-information feature: who can read a fruit's effects is a skill-gated secret.

## What the repo already has

- Room `HYDROPONIC_CENTER` ("Hydroponic center") with one piece of equipment, `PLANT_CONTROLLER` (`shared/src/equipment.ts`, no behaviour). The original's objects sheet has no entry for it (see "Plant controller" below for a guess at its purpose).
- Skill ids `botanic`, `green_thumb`, `frugivore`, `skilful` (`shared/src/skills.ts`), with no effects. Their en/fr/es text is in the locales.
- The `garden` resource (`RESOURCE_IDS`, `shared/src/resources.ts`), always 0, with translated text.
- The `botany` feature chat channel (`FEATURE_CHANNELS` in `shared/src/types/chat.ts`).
- NERON projects `EXTRA_HYDROPONPOTS`, `HYDROPONIC_INCUBATOR`, `HEAT_LAMP`, `FOOD_RETAILER`, `PARASITE_ELIM` are in `shared/src/projects.ts`. They can be completed but have no effects ("None have effects yet").
- The planet tag `FRUIT_TREES` (`shared/src/planets.ts`). Expeditions are not built.
- Patterns to reuse:
  - `consume` (`actions/consume.ts`, `ItemType.consume` with `ap`/`satiety`/`morale`) for eating fruit.
  - `cook` for "changes type in place".
  - Microwave `charges` and `rechargeMicrowaves` for a per-item counter that changes at day change.
  - `grantCarePoints` (`rules.ts`) plus `pilgredPointsGain` (`modifiers.ts`) for daily skill points. `repair_pilgred.ts`'s `paidWithPoint` is the template for "a point makes the action free".
  - `dirtyChance` on actions, for the original's `dirt` column.
  - `advanceCycle` in `rules.ts` is where the day-change step goes (beside `grantCarePoints` and `rechargeMicrowaves`).
- Not built, and botany partly depends on them: diseases (#214, open), random injuries on actions (#207, open), fire, expeditions, merchants, food decay, triumph.

## What the original gives us

The snapshot has data tables and shared helpers, not the server's action bodies or cycle code. So it has names, costs, statuses, and generators, but **no numbers for oxygen output, fruit output, or plant disease odds**.

### Items and the room (`Data/rooms.json`, `DataExt/objects.json`, `random_objects.json`, `Utils.hx`)

- The garden starts with `TREE_POT, BANANA_TREE, BANANA_TREE`. `BANANA_TREE` is a meta object: at creation it becomes a `TREE_POT` carrying the banana plant skin (`Utils.hx`: `it.id = TREE_POT; setSkin(it, SK_PLANT, Const.BANANA)`). So the start is **one empty hydropot and two bananas**.
- `random_objects.json`: 2 more `TREE_POT` in the "Store" category (storage rooms).
- A plant is a **hydropot item with a plant skin**, not equipment. An empty pot is a hydropot with no skin.
  - `TREE_POT`, "HydroPot": "lets you sow a fruit and so grow the Garden". Status `DESTRUCTIBLE`. Actions `WATER_PLANTS, TREAT_PLANTS, NEW_PLANTS_GRAFTING`.
  - Pots don't stack (`Inventory.hx` special-cases `TREE_POT` and `CONSUMABLE`).
- Fruits are `CONSUMABLE` items with a fruit skin. `CONSUMABLE` actions: `EAT, COOK_RATION, QUICK_COOK_RATION, UNCOOK, NEW_PLANTS_SEEDING`.
- `HYDROPONIC_CENTER` room type: "the main source of **O²**". `has_closet: true` (the tutorials keep plants "on the shelf").
- `Const.MAX_PLANT_PER_GARDEN = 10`.
- Start flavour text (`INIT_GARDEN_SCREWED`): "The garden was wrecked by the attack: of the 12 plants, only 2 are left, and one empty pot."

### Species (`Data/Skins.json`, `Gameplay.hx`)

There are 14 species, by index: `0 BANANA`, `1 LIANISTE`, `2 CACTUOR`, `3 BIFALON`, `4 POULMINO`, `5 PRECATUS`, `6 BUITALIEN`, `7 PLATACIA`, `8 TUBILISCUS`, `9 PEUPLIMOUNE`, `10 FIBONICCUS`, `11 MYCOPIA`, `12 ASPERGINULK`, `13 CUCURBITATROUILLE` (Halloween in eMush). Each species has a tree name and description and a fruit name, description and background, in French only (Banane, Lianube, Balargine, Goustiflon, Toupimino, Precati, Bottine, Fragilane, Anémole, Pénicule, Kubinus, Calebotte, Filandru, Citrouïd).

**Growth time, rolled per game** (`Gameplay.genTreeList`):
- Banana is always **36 cycles** (4.5 days).
- The other species get a shuffled draw from `[48, 24, 16, 12, 12, 8, 8, 8, 8, 8, 4, 2]` cycles, padded with `8` for any extra species.
- A list of per-species tree side effects ("double fruit but dries faster", "double oxygen but spreads fire", "free spores", ...) exists only as comments; every entry is empty. Not a rule.

**Fruit effects, rolled per game** (`Gameplay.genFruitList`):
- Every fruit gives **+1 AP and +1 satiety**. Two species in three (index `i % 3 != 2`) also give **+1 morale**.
- The banana is index 0, so it gets +1 AP, +1 satiety and +1 morale, plus **+1 HP**. Banana effects are fixed; the alien species are shuffled.
- Then `species - 1` random extra effects (13), each assigned to a random alien fruit (so some fruits get several and some none). The type cycles `i % 5`:
  - 0 and 1: `CURE(disease)`, weighted by `disease.weight` among diseases with `fr_cure`.
  - 2 and 3: `SET_DISEASE(disease, incubation 0–11 cycles, duration 1–8)`, among diseases with `fr_give`.
  - 4: another +1 AP.
- Each extra effect has a 1-in-3 chance of being wrapped in `UNSTABLE(effect, 25–70%)`, which applies only with that probability.

### Statuses (`DataExt/object_status.json`, all `public: true`)

| id | name | description (translated) |
|---|---|---|
| `PLANT_YOUNGLING` | Young plant | No oxygen or fruit until it matures. |
| `PLANT_THIRSTY` | Thirsty | "It will only produce oxygen. If it isn't watered, tomorrow it becomes **Dried**." |
| `PLANT_DRY` | Dried | "No fruit and no oxygen. If it isn't watered, tomorrow it will be **dead**." |
| `PLANT_DISEASED` | Sick | No fruit and no oxygen. |

Icons exist for all four (`www/img/icons/ui/plant_*.png`).

### Actions (`DataAction/actions.json`, `fake.json`)

All four are colour `GARDEN` (garden points pay for them), sector `Hydroponie`, `mush_confirm: true` (a Mush is asked to confirm, since it helps the humans), tracked, and public.

| id | cost | name | dirt | hurt | notes |
|---|---|---|---|---|---|
| `WATER_PLANTS` | 1 AP | Arroser (Water) | 15% | – | On a pot, not in hand. "Quenches your plantations' thirst." Refused unless the plant is thirsty or dried: "This plant doesn't look short of water." |
| `TREAT_PLANTS` | 2 AP | Traiter (Treat) | 15% | 1% | On a pot, not in hand. "Cures plant diseases." Refused unless diseased. |
| `NEW_PLANTS_SEEDING` | 2 AP | Semer (Sow) | 15% | – | On a fruit. "Sacrifices a fruit to create a new plant." Needs an empty pot (the tutorial: "a fruit and an empty Hydropot"). |
| `NEW_PLANTS_GRAFTING` | 2 AP | Greffer (Graft) | 30% | – | On a pot that has a plant, with a fruit. "Sacrifices a fruit and a plant to create a new plant, which starts as a young shoot. Optimal hygiene required." It has a confirm dialog about hygiene and can fail (`NEW_PLANT_GRAF_FAILURE`: "something must have contaminated the operation"). Botanist only (skill footnote). |

None of the four has a success roll (`proba` is empty). The graft's failure condition is hygiene, not odds.

Log lines (`DataEvents/events.json`):
- `WATER_PLANT`, `TREAT_PLANT`, `NEW_PLANT_SUCCESS` / `NEW_PLANT_FAILURE`, `NEW_PLANT_GRAF_SUCCESS` / `NEW_PLANT_GRAF_FAILURE`.
- `PLANT_MATURED` ("$un_i has matured! At last!"), `FRUIT_MATURED` ("One of the plants produced: $i"), `PLANT_DEAD` / `PLANT_DICEASED` ("$le_i died... sniff!"), `PLANT_HURT`.
- `LAST_WATERED_NEED` / `LAST_TREATMENT_NEED`: "You read the date of the last watering: Day X Cycle Y. Some plants are thirsty..."

### Plant controller (a guess)

Pots carry `PlantCtrlInfos {w, t}` (`Protocol.hx`), and the `LAST_*_NEED` lines show a *last watered / last treated* date, with conditions `PlantNeedWater` / `PlantNeedTreatment`. This looks like what our `PLANT_CONTROLLER` equipment shows: the last time the garden was watered or treated, and whether any plant needs it. It is an inference, not documented.

### Skills (`Data/skills.json`, `heros.json`)

- **Botanist** (`BOTANIC`; Jiang Hua and Ian Soulton have it):
  - Reads fruit and plant properties.
  - Can graft.
  - **+2 garden points per day, max 4** (`IncrMaxPA(GARDEN, 4) + IncrPAPerDay(GARDEN, 2)`).
  - On expeditions, Harvest gives +1 fruit.
  - Bonus on some NERON projects.
- **Green Thumb** (`GREEN_THUMB`; Ian): starts with **two extra hydropots** in hand (`GiveItem(TREE_POT)` ×2). Their grafts start with a short maturation cycle.
- **Frugivore** (`FRUGIVORE`; Ian): **+2 AP** extra from alien fruit, **+1** from bananas. Not retained when turned Mush.
- **Skilful** (`SKILFUL`): counts as Botanist, Diplomat and Biologist, but without their actions or resources. So it reads fruit and plants but can't graft and gets no points.
- **Cook** (`COOK`): also reads fruit properties.
- **Assimilation** (Mush, unfinished row with no name or flags): "For 3 AP you can eat a plant and recover 4 HP (discreet action)."
- Garden points (`PAColors.GARDEN`): "free actions **in the Hydroponic Garden**."

### NERON projects (`Data/projets.json`)

| id | effect (footnote) | tags |
|---|---|---|
| `EXTRA_HYDROPONPOTS` | Spawns 3 `TREE_POT` in the garden. | Engineer, Botanist |
| `HYDROPONIC_INCUBATOR` | Young plants in the garden grow 2× as fast. | Physicist, Botanist |
| `HEAT_LAMP` | In the garden, 50% chance of one extra fruit. | Engineer, Botanist |
| `FOOD_RETAILER` | Garden food goes straight to the Refectory. | Robotics, Cook |
| `PARASITE_ELIM` | Footnote: young plants' growth time −4 cycles. Notes: −2. eMush: sick plants still produce. **Three different readings.** | all |

`OXY_MORE` (20% chance per cycle to save the crew's oxygen) is oxygen, not botany.

### Elsewhere (out of scope until those systems exist)

- Expeditions: the `HARVEST(n)` event (1–3 alien fruits, +1 per Botanist); the `FRUIT_TREES` planet tag.
- Merchants: trading hydropots for oxygen and fuel capsules, or crew for pots.
- `PILGRED_SYNTH`: "makes a Ration, a Fruit, or a Medicine each day."
- Triumph: Ian's "Naturalist" (+3 per new alien species he plants); Eden "Biodiversity".
- Fire destroying plants; food decay statuses (`FOOD_UNSTABLE`, `HAZARDOUS`, `DECAYING`, `FROZEN`); the "carnophobe" disease (fresh food only).

## What the eMush wiki says (fills the original's gaps)

Sources: emushpedia.miraheze.org pages `Jardinage`, `Plantes`, `Fruits_Aliens`, `Hydropot`, `Botaniste`, and the three project pages (read 2026-10-22). These describe eMush, not the original.

**Day change**, in this order:
1. A young plant whose age has reached its maturation becomes adult.
2. Each adult plant that is not sick and not dried makes **+1 oxygen**. If it is also not thirsty, it makes **1 fruit** of its species.
3. Plants dry out (healthy → thirsty → dried → dead) and may fall sick.

Example: "A plant sown at cycle 1 that needs 8 cycles will be adult and produce from cycle 1 of the next day."

**Growth:** age starts at 0 (1 if grafted) and goes up by 1 per cycle. The Botanist sees the remaining time.

**Thirst:** a plant not watered that day is thirsty at day change. A second missed day makes it dried, a third kills it. Watering costs 1 AP (or a garden point) and clears thirst or drying. A dead plant gives its pot back.

**Sickness:** "at each cycle change, a plant can become sick". No odds are given. Treat costs 2 AP.

**Sowing:** 2 AP. Needs the fruit in your inventory and an empty hydropot "on the shelf". The fruit and the pot become a young plant.

**Grafting:** 2 AP, Botanist only (not Skilful). On success the plant becomes a young plant (age 1) of the fruit's species. On failure the plant dies and the fruit is lost. It fails if the plant is dirty, sick, thirsty or dried.

**Cap:** "Without trades, up to 10 plants at once" (1 pot in the garden + 2 in storage + 3 from the project + 2 from Green Thumb + the 2 bananas).

**Fruit:** fruits stack and can't be cooked. Only the Botanist, the Cook, or a Mush can see fruit effects. Effects are fixed per game. eMush's alien-fruit distribution is different from the original's:
- AP: +1 (90%), +2 (9%), +3 (1%).
- Morale: +1 (70%), none (30%).
- Number of extra effects: 0–4.
- Alien maturation: 2, 4, 8, 12, 16, 24 or 48 cycles.

**Plants carried or on the shelf:** "makes no difference". But the incubator and heat-lamp pages say their effects work "even when carried". The two statements contradict each other.

## Where the sources disagree or are silent

1. **Oxygen per plant.** The original gives no number. eMush says +1 per healthy adult plant per **day**. Against our burn of 8 per day, the two starting bananas slow the loss, and 8 or more healthy plants make the ship self-sustaining (10 plants give a surplus of 2 per day).
2. **Water one plant or all?** `WATER_PLANTS` has `need_target: false` and its description is plural ("your plantations"). eMush waters one plant per action.
3. **Plant sickness odds**: no source gives them.
4. **Graft hygiene**: does it fail when the *actor* is dirty (the original's confirm text) or when the *plant* is dirty (eMush)? Our plants have no dirty status.
5. **Treat dirt**: 15% in the original; eMush says "strong chance".
6. **Fruit effects**: the original's generator or eMush's distribution. Both need diseases (#214) for most of their extra effects.
7. **`PARASITE_ELIM`**: three readings (see the projects table).
8. **Where a plant must be** to grow or produce (garden only, or anywhere including carried).

## Owner direction (2026-10-22)

- **Mechanics and actions first.** Alien species, alien fruits, and everything that depends on them (the per-game fruit table, reading fruit properties, Frugivore's alien bonus, grafting) are deferred until expeditions exist. Until then the only species is the banana.
- **Plant sickness is hidden.** Only Botanists and Skilful (Polyvalent) players can see that a plant is sick.
  - Anyone else can treat any plant, so they may spend AP treating a healthy one. A ship with no Botanist or Skilful player has to treat every plant to be safe.
  - **Botanists cannot treat a healthy plant.** They can see it is healthy, so refusing them leaks nothing.
  - In the original, sickness is public and anyone is refused on a healthy plant. Refusing a player who can't see sickness would leak it, so for them `treat` is legal on every plant and gives the same result and log line either way.
- **Mush gain no botany abilities.** Being Mush doesn't let you see sickness (unlike eMush, where Mush can read fruit effects).
- **Thirsty plants make no oxygen** (unlike eMush, where they still do). Only an adult plant that is not thirsty, not dried and not sick produces.
- **Watering is one plant per action.**
- **Sickness: a placeholder 5% chance per plant per cycle** (`config.botany.sickChancePerCycle = 0.05`), rolled separately for each plant with the seeded RNG.
- **Plants work anywhere**: in the garden, in another room, or carried. Growth, thirst, sickness and production don't depend on location. A banana from a plant on the floor appears on that room's floor. A banana from a carried plant goes into the carrier's inventory first, or onto the floor of their room if their inventory is full.
- **Garden points work only in the garden**: they pay for an action only on a plant in `HYDROPONIC_CENTER`.
- **Garden actions are public** in the room's history. Water, treat and sow each have the original's 15% chance of making the actor dirty, through `dirtyChance`.
- **Sickness can kill a plant, but there is no plant death in Pass 1**, from sickness or from thirst. In Pass 1 a dried plant stays dried.
- **Young plants can fall sick**, and **a sick plant still gets thirsty**.
- **Oxygen and costs**: +1 oxygen per producing plant per day; water 1 AP, treat 2 AP, sow 2 AP.
- **The Botanist "role"**: Botanist and Skilful (Polyvalent, "versatile") players are both in it. They see sickness and are refused on healthy plants.
- **Garden points are Botanist only.** Skilful players are in the Botanist role but get no garden points, as in the original.
- **A Botanist who becomes Mush keeps the role**, and still sees sickness. Being Mush adds nothing and takes nothing away.
- **Mush can water, treat and sow like anyone else.** The original's Mush confirm prompt (`mush_confirm`) is not planned.
- **The two starting pots go in `STORAGE_FRONT`.**

## Proposed plan

Small passes, each playable on its own.

### Pass 1: the garden loop (bananas only, no plant death)

**State**
- `ItemType` `hydropot`: carriable, takes a slot, doesn't stack.
- `ItemState.plant?: { species: string; age: number | null; thirst: 0 | 1 | 2; sick: boolean }`. `age` is null once adult; `thirst` is 0 healthy, 1 thirsty, 2 dried. `species` is always `banana` for now, but keeping the field leaves room for alien species later.
- `ItemType` `banana` (a fruit).
- Start: one empty pot and two adult bananas in `HYDROPONIC_CENTER`, and two empty pots in `STORAGE_FRONT`.

**Actions**, one file each in `shared/src/actions/`, costs in `config.botany`:
- `water` (1 AP, the original's cost) on one thirsty or dried plant. Thirst is public, so refusing to water a healthy plant leaks nothing.
- `treat` (2 AP) clears `sick`.
  - For a player in the Botanist role (Botanist or Skilful), it is offered only on sick plants.
  - For everyone else it is offered on every plant. On a healthy plant it does nothing, with the same cost, result and log line as on a sick one.
- `sow` (2 AP) on a banana you carry, with an empty pot in the room. The pot becomes a young banana plant (36 cycles).
- `eat`, through the existing `consume`: +1 AP, +1 satiety, +1 morale, +1 HP.

**Cycle and day change** (`botanyCycle` / `botanyDay` in a new `shared/src/botany.ts`, called from `advanceCycle`):
- Every cycle: young plants age by 1, and each plant that isn't already sick has a 5% chance of falling sick.
- At day change:
  1. Young plants that reached maturity become adult.
  2. Each adult plant that is not thirsty, not dried and not sick makes +1 oxygen (capped at the ship max) and one banana where the pot is.
  3. Thirst goes up by one for every plant not watered that day, stopping at dried (no death in Pass 1).

**Who can see sickness**
- One function, `isBotanistRole(state, player)`, true for Botanist and Skilful and never granted by the Mush role. `viewFor`, `treat`'s offer and the UI all use it.

**Garden points**
- `gardenPointsPerDay` (2) and a cap (4) through the modifier registry. Botanist only; Skilful gets none (as in the original).
- A point pays for water, treat or sow, but only when the target plant is in `HYDROPONIC_CENTER`. Anywhere else, the action costs AP.

**Hidden information.** This is the first hidden status on an item, so these need care:
- `ItemState.plant.sick` is stripped in `viewFor` unless `isBotanistRole`. It goes in `leakFields.ts`, with a sentinel test showing that a non-Botanist's view (a Mush's included) never contains it.
- For a player who can't see sickness, `treat` must not reveal anything: the same offer, cost, result, log text and timing whether or not the plant was sick. A Botanist's refusal is fine, since only they see it.
- The public log line for `treat` must be the same for a Botanist treating a sick plant and a non-Botanist treating a healthy one, so onlookers learn nothing either.
- **Side channels:** a sick plant makes no oxygen and no banana. Anyone who watches the ship's oxygen total or the pots at day change can infer that some plant is sick, and often which one. Leaking through outcomes like this seems acceptable as deduction (it is a social deduction game), but the log must not name the sick plant or give a reason.
- Run the `leak-check` skill once this pass is done.

**Log:** water, treat and sow are public in the room's history (owner). Matured and produced lines go in the history of the room the plant is in (if carried, the carrier's room). There are no sickness lines for anyone who can't see sickness; falling sick is never logged publicly. All text goes through i18n (en/fr/es), with the original's French as the starting point for fr.

**UI**
- Pot and banana-plant icons from `www/img/icons/items/` (`tree_pot`, `tree_banana`, `fruit_banana`) and the `plant_*` status icons. Run the `asset` skill's licence check first.
- The sick icon renders only when the view has it.
- Water, treat, sow and eat go through `actionsOn` in `web/src/hud/targets.ts`, so they work on phones too.

**Tests:** `shared/tests/botany.test.ts`:
- The thirst ladder (stopping at dried), maturation timing (the "cycle 1 of the next day" example), and the oxygen cap.
- Thirsty, dried and sick plants make neither oxygen nor bananas.
- The sickness roll, with the chance forced to 0 and 1 through config.
- Plants grow and produce outside the garden and when carried.
- Sow needs an empty pot; garden points pay for actions.
- A non-Botanist treating a healthy plant pays the same and reads the same as treating a sick one.
- A Botanist can't treat a healthy plant.
- Sickness is absent from non-Botanist views, Mush included, and present for Botanist and Skilful.
- Illegal actions leave state unchanged.

### Pass 2: plant death, the plant controller and projects

- Plant death: from thirst (past dried) and from sickness (timing to decide). The pot becomes empty, and a died line goes in the garden's history.
  - A sickness death is itself a side channel; this is to decide.
- `PLANT_CONTROLLER` as an `access` terminal showing when the garden was last watered and treated, and which plants are thirsty. It reports sickness only to a reader who can see it.
- Project effects:
  - `EXTRA_HYDROPONPOTS`: spawn 3 pots.
  - `HYDROPONIC_INCUBATOR`: young plants age 2× per cycle.
  - `HEAT_LAMP`: 50% chance of an extra fruit.
  - `PARASITE_ELIM`: as decided.
  - `FOOD_RETAILER`: fruit spawns in the Refectory.
- Green Thumb's 2 extra pots at the start.
- Update the `projects.ts` status for each.

### Deferred until expeditions

- Alien species, the per-game growth and fruit-effect table, and who reads fruit properties.
- Frugivore's alien bonus (its +1 AP on bananas could come in Pass 1 if wanted).
- Grafting, which needs a second species to mean anything.
- Fruit disease effects, which also need #214.
- Also out of scope: Assimilation (unfinished in the original), merchant trades, fire, food decay, triumph, Halloween's Cucurbitatrouille.

## Open questions for the owner

Everything in "Owner direction" is answered. Pass 1 has no open questions. Still open for Pass 2:

1. How long until a sick plant dies? Do eMush's thirst steps carry on to death, one missed day after dried?
2. **`PARASITE_ELIM`**: which of the three readings? With hidden sickness, eMush's "sick plants still produce" would also remove the side channel.
