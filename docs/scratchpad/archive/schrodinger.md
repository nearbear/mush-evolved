# Schrödinger — Extraction from `Mush/`

Notes extracted from the original Mush data and assets in `Mush/` (spreadsheet data in `Mush/derived/data/` is in French).

## 1. Item / Entity Definition

* **ID:** `BODY_CAT` (`Mush/derived/data/DataExt/objects.json`)
* **Name:** Schrödinger (`gender: "m"`, `displayInMenu: "true"`)
* **Starting status:** `DESTRUCTIBLE`
* **Actions on item:** `CARESS`, `MUSH_CARESS`
* **Gameplay description:** *"Schrödinger est un chat un peu grincheux mais tout à fait soyeux."*
* **Background lore:** *"Un beau chat, fort doux et charmant. / Quand il miaule, on l'entend à peine, / Tant son timbre est tendre et discret." C'est le chat de Raluca.* (`Mush/derived/data/DataExt/objects_background.json`)

## 2. Actions

* **`CARESS` ("Caresser")** (`Mush/derived/data/DataAction/actions.json`):
  * Cost: `1` AP | Hurt: `10` | Filter: `pnj(Cat)` | Tracked: `true`
  * Footnote: `Unique : + 3 :pmo:` (+3 Morale, once)
  * Blocked for `GERMAPHOBIC` characters (`Mush/derived/data/DataAction/fake.json`, `Mush/derived/data/Data/heros_status.json`)
* **`MUSH_CARESS` ("Caresse Infectieuse")** (`Mush/derived/data/DataAction/actions.json`):
  * Cost: `1` AP | Enable: `IsMush` | Tracked: `true`
  * Turns Schrödinger into a Mush agent (*"Vous avez fait voyager \*Schrödinger\* vers le Mush."*).
* **`PICK_CAT` ("Prendre")** (`Mush/derived/data/DataAction/actions.json`):
  * Cost: `0` AP | Hurt: `20` | Filter: `pnj(Cat)` | Tracked: `true`
  * Places Schrödinger in the player's inventory (can contaminate the player if Schrödinger is Mush, per `HERO_INFECTED_BY_CAT`).

## 3. Research

* **`NCC_LENS` ("Lentille NCC")** (`Mush/derived/data/Data/research.json`):
  * Ingredients: `BODY_CAT` | Difficulty: `20`
  * Effect: `NTimes( 2, SpawnItem( NCC_LENS, LABORATORY ))` — spawns 2 pairs of NCC Lenses (`ToHit(10)`, `+10%` to shooting actions per `Mush/derived/data/DataExt/objects.json`).
* **`SENSORS_1` ("Senseurs I")** (`Mush/derived/data/Data/research.json`):
  * Ingredients: `BODY_CAT, MUSH_SAMPLE` | Difficulty: `4`
  * Unlocks ThermoSensors blueprints in the Workshop.

## 4. Diseases & Statuses

* **`CAT_PHOBIA` ("Ailurophobie")** (`Mush/derived/data/DataExt/disease.json`):
  * `immune: "IsMush"` | `gain_on: "HurtByAlien"` | `need_shrink: "true"` | `fr_give: "false"` | `fr_cure: "false"`
  * Seeing the cat forces the player to flee (`CAT_FLED`).
* **`CAT_ALLERGY` ("Allergie au chat")** (`Mush/derived/data/DataExt/disease.json`):
  * `immune: "IsMush"` | `gain_on: "Board"` | `need_shrink: "false"` | `fr_give: "true"` | `fr_cure: "true"`
  * Seeing the cat causes sneezing and pustules; contact can trigger `CAT_ALLERGY_CRISIS`.
* **`GERMAPHOBIC` ("Germaphobe")** (`Mush/derived/data/Data/heros_status.json`):
  * Cannot caress Schrödinger; loses morale while dirty.

## 5. Events & Logs

* **Movement & Awakening** (`Mush/derived/data/DataEvents/events.json`):
  * `CAT_ENTERED`: *"Schrödinger est entré."* (`custom_css: "pic_cat"`)
  * `CAT_LEFT`: *"Schrödinger est sorti."* (`custom_css: "pic_cat"`)
  * `CAT_AWAKEN`: *"\*Schrödinger\* se réveille en même temps que \*Raluca\* et il n'a pas l'air content."*
* **Interactions & Hazards** (`Mush/derived/data/DataEvents/events.json`):
  * `CUDDLE_CAT`: *"$h fait un gros câlin à Schrödinger, celui-ci n'en veux manifestement pas mais ce n'est pas grave, ça fait toujours du bien..."*
  * `HERO_INFECTED_BY_CAT`: *"$s a été contaminé par $h en prenant \*Schrödinger\*. Son niveau de contamination est maintenant de \*::parasite_level::\*."*
  * `CAT_FLED`: *"Le chat était dans la pièce, vous n'avez pas pu vous empêcher de fuir..."* (`custom_css: "pic_cat"`)
  * `CAT_ALLERGY_CRISIS`: *"$h subit une éruption cutanée fulgurante, il étouffe, on lui avait pourtant dis de ne pas prendre ce #%$ de chat !"* (`custom_css: "pic_disease"`)
* **Death (`CAT_DEAD`)** (`Mush/derived/data/DataEvents/events.json`, `Mush/derived/data/Ebe-Neron/events.json`):
  * `line_inhib`: *"\*Décès enregistré :\* Schrödinger, cause « État incompatible avec la vie »."*
  * `line_crazy`: *"\*Chat mort.\* Chat pue. Retirer son cadavre, humains ? [Kzz] Idée, idée, JE ouvrir les baies !! Vwouf tout partir dans l'espace !! Je ouvr.. [Kzz] Non, non, pas encore... A-True : Néron se souvient. Gentille Janice."*
  * `line_evil`: *"Suite à la ||perte attristante|| de l'être biologique le plus intelligent du vaisseau - le \*chat Schrödinger\* - merci de prendre grand soin des plantes du jardin : ce sont les derniers spécimens vivants capables de relever le niveau."*

## 6. Endgame Glory, Trophies & Fun Facts

* **Glory Events (Human team)** (`Mush/derived/data/DataEvents/glory_event.json`):
  * `EDEN_CAT` (`+4`, *"Paradis des chats"*): Schrödinger survived and reached Eden with the crew.
  * `EDEN_NO_CAT` (`-4`, *"Les chats se cachent pour mourir..."*): Schrödinger was not with the crew on the trip to Eden.
  * `EDEN_MUSH_CAT` (`-8`, *"Chatastrophe"*): Schrödinger became Mush and reached Eden with the crew.
* **Trophy** (`Mush/derived/data/DataEco/trophies.json`):
  * `cat_cuddled`: *"Schrodinger pris dans les bras"* (`Perso/Compteur`)
* **Fun Fact** (`Mush/derived/data/DataEvents/funFacts.json`):
  * `bestCaresser`: *"Accro au poils de chat"*

## 7. Lore, Exploration & Miscellaneous

* **Raluca Tomescu:** Smuggled Schrödinger aboard against doctors' orders (`Mush/derived/data/DataDesc/char_desc.json`); her `Asocial` objective notes that cuddling Schrödinger helps her morale (`Mush/derived/data/DataExt2/objectives.json`).
* **Expeditions** (`Mush/derived/data/DataExplore-Ebene/core_events.json`):
  * `SCHRODINGER` exploration event (`tags: "OXYGEN"`).
  * Stowaway landing log where Schrödinger sneaks onto the expedition ship, forcing an impromptu return trip.
* **NERON Quips** (`Mush/derived/data/DataExt2/quips.json`):
  * Janice asking NERON to stop setting Schrödinger on fire.
* **Death Cause Reference** (`Mush/derived/data/DataExt/deaths.json`):
  * `SCHRODINGER_BOX`: *"Paradoxe EPR dit 'chat de schrödinger'"* — lost in space in a survival pod.

## 8. Image Assets

* Item icon (alive): `Mush/www/img/icons/items/body_cat.jpg` (50×50 PNG data)
* Item icon (dead, in `archive/`): `Mush/www/img/icons/items/archive/body_cat_dead.jpg` (50×50 JPEG)
* UI / log icon: `Mush/www/img/icons/ui/cat.png` (16×16 RGBA PNG)

## 9. FDS Judge Modules (`randFds`)

In `Mush/data/dataGen.xml` (`randFds`), **Judge Modules** (*Juge Module 3*, *9*, *10*, *12*, *17*, *25*, *36*, *53*, etc.) are the **AI/robotic judges of the FDS** (*Le Tribunal FDS* / *Les Geôles de la FDS*)—Mush's in-universe moderation and automated prison system.

* Players reported and penalized for moderation offenses (e.g. ToS violations, flooding, griefing/"pourrissage" in `Mush/derived/data/DataEco/fds.json`) are sent to the **FDS Jails** (*Geôle automatisée 5890*).
* The `randFds` lines are flavor messages from these Judge Modules bantering with NERON, commenting on player complaints, and taunting prisoners—including three lines mentioning Schrödinger (e.g. claiming Schrödinger is the only intelligence aboard, asking if Schrödinger is lying on NERON's terminals, and revealing that Schrödinger reported the prisoner).

*(Unrelated to the FDS Judge Modules, there is also a character skill `JUGE` / "Juge" in `Mush/derived/data/Data/skills.json` that lets a player mark a crewmate as a Pariah.)*
