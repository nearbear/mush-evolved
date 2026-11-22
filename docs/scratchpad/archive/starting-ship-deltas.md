# Starting Ship State Deltas: mush2 vs. eMush

**Date:** 2026-11-16  
**Sources:**
- `mush2`: `shared/src/config.ts`, `shared/src/ship.ts`, `shared/src/drugs.ts`, `shared/src/rules.ts`
- `eMush` (clean-room extraction via `npm run emush`): `DaedalusConfigData`, `PlaceConfigData`, `RandomItemPlacesData`, `CharacterConfigData`, `DaedalusInitEventSubscriber`, `PlayerEventSubscriber`

---

## 1. Ship Resource Gauges

| Resource | mush2 Start / Max | eMush Start / Max | Delta |
| :--- | :---: | :---: | :--- |
| **Oxygen** | **30** / 32 | **20** / 32 | `mush2` starts with **+10** oxygen |
| **Fuel** | 20 / **100** | 20 / **32** | `mush2` has a **100** max cap (vs. 32) |
| **Hull** | 100 / 100 | 100 / 100 | Match |
| **Plasma Shield** | 50 / 100 | 50 / 100 | Match |
| **Combustion Chamber** | 0 / 9 | 0 / 9 | Match |
| **Hunter Threat Points** | 40 (0 during preselection) | 40 | Match once Mush are selected |

---

## 2. Fixed vs. Random Item Distribution

In **eMush**, only 4 rooms have fixed items. The remaining starting items come from two random placement pools (`storage_default` across 5 storages, `daedalus_default` across all 27 rooms) plus 4 weighted random blueprints (`randomBlueprints`) placed uniformly across the 27 rooms.

In **mush2**, there are **no random room-placement pools**—all starting items (except Medlab drugs) are placed in fixed rooms in `DEFAULT_CONFIG.startItems`:

### Medlab (`SICK_BAY` vs. `medlab`)
* **Drugs:**
  * **eMush:** 1 of each of the 12 drug types (`bacta`, `betapropyl`, `eufurylate`, `newke`, `phuxx`, `pinq`, `pymp`, `rosebud`, `soma`, `spyce`, `twinoid`, `xenox`).
  * **mush2:** `stockMedlab` draws **12 random drugs with replacement** from `DRUG_ITEMS` (duplicates possible; some drug types may be absent).
* **Medical & Gear:**
  * **eMush:** Only `bandage` × 2 is fixed in Medlab. `medikit` is in `daedalus_default` (27 rooms), and `stainproof_apron` / `protective_gloves` are in `storage_default` (5 storages).
  * **mush2:** `bandage` × 2, **`medikit` × 1**, **`apron` × 1**, and **`protection_gloves` × 1** are all fixed in `SICK_BAY`.

### Refectory (`REFECTORY` vs. `refectory`)
* **eMush:** `standard_ration` × 32, `microwave` × 1, `superfreezer` × 1, **`mad_kube` × 1**.
* **mush2:** `uncooked_ration` × 32, `microwave` × 1, `freezer` × 1. **Missing `mad_kube`.**

### Hydroponic Garden (`HYDROPONIC_CENTER` vs. `hydroponic_garden`)
* **Match:** 1 empty `tree_pot` (`hydropot`) and 2 `tree_pot`s with adult `fruit_banana` plants (`banana_tree` × 2).
* *(Note: `mush2` also places 2 extra empty `tree_pot`s in `STORAGE_FRONT`, matching eMush's 2 `hydropot`s in `storage_default`.)*

### Front Corridor (`CORRIDOR_A` vs. `front_corridor`)
* **eMush:** Only `support_drone` × 1 is fixed in `front_corridor`.
* **mush2:** `support_drone` × 1, plus `camera` × 1, `extinguisher` × 1, `metal_scraps` × 4, `plastic_scraps` × 4, `thick_tube` × 2, and 6 fixed blueprints (`SOFA`, `MISSILE_LAUNCHER`, `ECHO_SOUNDER`, `HEAT_SEEKER`, `TRAD_MODULE`, `WHITE_FLAG`).

### Other Items Moved from eMush Random Pools to Fixed Rooms in `mush2`
* **`STORAGE_FRONT`:** `knife` × 1, `blaster` × 2, `grenade` × 1, `quad_compass` × 1, `drill` × 1, `tree_pot` × 2, `rope` × **4** (eMush has 2 in `storage_default`).
* **`ICARUS`:** `space_suit` × 6 (eMush places 6 randomly across all 27 rooms).
* **`LABORATORY`:** `wrench` × 1 (eMush: `storage_default`).
* **`CORRIDOR_B`:** `hacker_kit` × 1 (eMush: `storage_default`).
* **`CORRIDOR_C`:** `extinguisher` × 1 (eMush: `storage_default`).
* **`BEDROOM_A`:** `soap` × 1 (eMush: `storage_default`), `old_shirt` × 1 (eMush: `daedalus_default`).

---

## 3. Missing & Extra Starting Items in `mush2`

### Present in eMush, Missing in `mush2`
* `plastenite_armor` × 1 (`storage_default`)
* `duct_tape` × 1 (`storage_default`)
* `block_of_post_it` × 1 (`storage_default`)
* `antigrav_scooter` × 1 (`daedalus_default`)
* `mad_kube` × 1 (`refectory`)
* `grenade_blueprint` × 1 (`daedalus_default`; `mush2` has `MISSILE_LAUNCHER` blueprint instead)
* `camera` × 2 fewer (`mush2` has 1 in `CORRIDOR_A` vs. eMush's 3 in `storage_default`)

### Extra / Stand-In Items in `mush2` (Not Starting Items in eMush)
* **`COMMAND_CENTER`:** 1 skill book (`BOOK_ITEM`) for every skill in `SKILLS`.
* **`CORRIDOR_A`:**
  * 6 fixed blueprints (`SOFA`, `MISSILE_LAUNCHER`, `ECHO_SOUNDER`, `HEAT_SEEKER`, `TRAD_MODULE`, `WHITE_FLAG`) instead of eMush's `swedish_sofa_blueprint` + `grenade_blueprint` + 4 weighted random draws from `randomBlueprints`.
  * Craft stand-ins: `metal_scraps` × 4, `plastic_scraps` × 4, `thick_tube` × 2 (eMush only has 1 `thick_tube` in `storage_default`).
* **`SPACESHIP_BAY_AA`:** `oscilloscope` × 1 (in eMush, only `oscilloscope_blueprint` exists in `randomBlueprints`).
* **`STORAGE_FRONT` / `CORRIDOR_B`:** `mush_sample` × 1, `mush_floppy_disk` × 1, `body_cat` × 1, `water_stick` × 1, and `super_map` × 4 (1 in `STORAGE_FRONT`, 3 in `CORRIDOR_B`).
* **`STORAGE_FRONT`:** 2 extra `rope`s (4 total vs. eMush's 2).

---

## 4. Player Starting Inventory
* **Match:** Every player starts carrying an `itrackie` (`startInventory: [ITRACKIE_ITEM]` in `mush2`, `itrackie_default` in eMush `CharacterConfigData`).

---

## 5. Reference: eMush Random Starting Pools

### `storage_default` (24 items across 5 storages)
`camera_item` (3), `extinguisher` (2), `hydropot` (2), `blaster` (2), `rope` (2), `plastenite_armor` (1), `adjustable_wrench` (1), `knife` (1), `protective_gloves` (1), `duct_tape` (1), `soap` (1), `stainproof_apron` (1), `hacker_kit` (1), `block_of_post_it` (1), `thick_tube` (1), `grenade` (1), `drill` (1), `quadrimetric_compass` (1).

### `daedalus_default` (11 items across 27 rooms)
`spacesuit` (6), `medikit` (1), `antigrav_scooter` (1), `swedish_sofa_blueprint` (1), `grenade_blueprint` (1), `old_t_shirt` (1).

### `randomBlueprints` (4 draws across 27 rooms, total weight 39)
* Weight 8: `echolocator_blueprint`
* Weight 4: `oscilloscope_blueprint`, `lizaro_jungle_blueprint`, `white_flag_blueprint`, `babel_module_blueprint`, `extinguisher_blueprint`, `swedish_sofa_blueprint`
* Weight 2: `sniper_helmet_blueprint`, `rocket_launcher_blueprint`, `old_faithful_blueprint`, `thermosensor_blueprint`, `grenade_blueprint`
* Weight 1: `support_drone_blueprint`
