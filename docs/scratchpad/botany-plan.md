# Botany: what the original gives us, and a plan (draft)

Status: **draft, 2026-10-22. Nothing is built or decided.** Everything under "What the original gives us" comes from `Mush/` (Motion Twin's data tables and shared Haxe code) and is reference only. "What the eMush wiki says" is a second, weaker source: the French eMushpedia, which describes Eternaltwin's remake (not the original) and is partly out of date. Neither source makes anything a rule. A rule exists once the owner answers the open questions and the answer goes into `docs/rules-design.md`.

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

1. **Oxygen per plant.** The original gives no number. eMush says +1 per healthy adult plant per **day**. Against our burn of 8 per day, two bananas would give only 2. Even 10 plants don't break even, so the garden would only slow the loss. This is the most important number to decide.
2. **Water one plant or all?** `WATER_PLANTS` has `need_target: false` and its description is plural ("your plantations"). eMush waters one plant per action.
3. **Plant sickness odds**: no source gives them.
4. **Graft hygiene**: does it fail when the *actor* is dirty (the original's confirm text) or when the *plant* is dirty (eMush)? Our plants have no dirty status.
5. **Treat dirt**: 15% in the original; eMush says "strong chance".
6. **Fruit effects**: the original's generator or eMush's distribution. Both need diseases (#214) for most of their extra effects.
7. **`PARASITE_ELIM`**: three readings (see the projects table).
8. **Where a plant must be** to grow or produce (garden only, or anywhere including carried).

## Proposed plan (to confirm)

Small passes, each playable on its own.

### Pass 1: the garden loop (bananas only)

**State**
- `ItemType` `hydropot`: carriable, takes a slot, doesn't stack.
- `ItemState.plant?: { species: string; age: number | null; thirst: 0 | 1 | 2; sick: boolean }`. `age` is null once adult; `thirst` is 0 healthy, 1 thirsty, 2 dried.
- `ItemType` `fruit` with `ItemState.species`.
- Start: one empty pot and two adult bananas in `HYDROPONIC_CENTER`, and two pots in storage (which storage rooms is to confirm).

**Actions**, one file each in `shared/src/actions/`, costs in `config.botany`:
- `water` (1 AP).
- `sow` (2 AP). On a fruit you carry, with an empty pot in the room. Turns the pot into a young plant of the fruit's species.
- `eat` through the existing `consume`. Banana: +1 AP, +1 satiety, +1 morale, +1 HP.

**Day change** (`botanyDay(state)` in a new `shared/src/botany.ts`, called from `advanceCycle`'s `newDay` branch):
- Mature young plants.
- Produce oxygen (capped at the ship max) and fruit (placed in the pot's container).
- Apply thirst, drying and death; a dead plant becomes an empty pot.
- Young-plant age goes up every cycle.

**Botanist:** `gardenPointsPerDay` and the cap through the modifier registry. Points pay for water and sow. "Only in the garden" is to confirm.

**Log:** matured, produced and died lines in the garden's public history. Water and sow are public in the room. All through i18n (en/fr/es), using the original's French text as the starting point for fr.

**Views:** plant statuses are public, so a plant's status shows to anyone who can see the item. Growth time stays hidden except from Botanists (see Pass 2).

**UI:**
- Pot, plant and fruit icons from `www/img/icons/items/` (`tree_pot`, `fruit_tree00–13`, `fruit00–13`), plus the status icons. Run the `asset` skill's licence check first.
- Water, sow and eat go through `actionsOn` in `web/src/hud/targets.ts`, so they work on phones too.

**Tests:** `shared/tests/botany.test.ts` covering the thirst ladder, maturation timing (the "cycle 1 of the next day" example), the oxygen cap, sow needing an empty pot, garden points, and illegal actions leaving state unchanged.

### Pass 2: alien species and hidden fruit knowledge

- `state.botany.species`: a per-game table of growth cycles and fruit effects, rolled with the seeded RNG at game start (the original's or eMush's generator, as chosen). This is **hidden state**: add it to `leakFields.ts` and give it a sentinel in `leaks.test.ts`.
- `viewFor` adds a fruit's or plant's properties (effects, growth time) only for seats allowed to read them (Botanist, Skilful, Cook; Mush per eMush?). Run the `leak-check` skill.
- Frugivore and Green Thumb (2 pots at the start).
- **Problem:** with no expeditions or merchants, alien fruit has no source, so the crew only ever has bananas. Options: start a few alien fruits in the garden or storage; let `PILGRED_SYNTH` make them; or wait for expeditions.

### Pass 3: sickness, treatment, grafting

- Plant sickness roll per cycle, and `treat` (2 AP).
- `graft` (Botanist, 2 AP, the hygiene rule as decided).
- Fruit disease effects (`CURE` / `SET_DISEASE`) wait for #214. Until then, alien fruits only get their AP, satiety and morale parts.

### Pass 4: projects and the plant controller

- Project effects:
  - `EXTRA_HYDROPONPOTS`: spawn 3 pots.
  - `HYDROPONIC_INCUBATOR`: young plants age 2× per cycle.
  - `HEAT_LAMP`: 50% chance of an extra fruit.
  - `PARASITE_ELIM`: as decided.
  - `FOOD_RETAILER`: fruit spawns in the Refectory.
- Update the `projects.ts` status for each.
- `PLANT_CONTROLLER` as an `access` terminal showing last watered and treated, and the plants that need care.

### Not in scope

Assimilation (unfinished in the original), expedition harvests, merchant trades, fire, food decay, triumph, Halloween's Cucurbitatrouille.

## Open questions for the owner

1. **Oxygen**: how much does a producing plant make, per cycle or per day? eMush gives +1 per day, which can't keep pace with −1 per cycle. Should the burn rate or the output change?
2. **Watering**: one plant per action (eMush) or the whole garden (the original's untargeted action)? Is the cost 1 AP?
3. **Where plants work**: only in `HYDROPONIC_CENTER`, or anywhere (carried included)? And are garden points usable only in the garden?
4. **Thirst timing**: eMush's day-change ladder (thirsty, dried, dead over 3 missed days)? Does a thirsty plant still make oxygen?
5. **Fruit effects**: the original's generator, eMush's distribution, or bananas only for now?
6. **Who reads fruit and plant properties**: Botanist, Skilful, Cook, and Mush too?
7. **Alien fruit source** before expeditions exist (see Pass 2).
8. **Sickness**: per-cycle odds, and is it Pass 3 or later?
9. **Graft**: Botanist only? Fails on a dirty actor or on a sick, thirsty or dried plant? Does it then kill the plant?
10. **Dirt and injury**: use the original's `dirt` (15/15/15/30%) through `dirtyChance`? Injury waits for #207.
11. **Logs**: are garden actions public in the room (as the original's non-stealth flags suggest), and are matured, produced and died lines in the garden's public history?
12. **Mush**: allowed to do all of it, with a confirm prompt like the original's `mush_confirm`?
13. **`PARASITE_ELIM`**: which of the three readings?
