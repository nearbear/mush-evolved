// Maps game ids to Motion Twin art in Mush/ (CC BY-NC-SA 4.0, see
// Mush/ATTRIBUTION.md). Vite bundles only the files matched here.

import { DEFAULT_CONFIG, REBEL_BASES, type CharacterId, type RebelBaseId, type Ending, type ItemView, type MerchantTargetView, type ResourceId, type SpoilStage, type TitleId } from "@mush2/shared";

type UrlMap = Record<string, string>;
const urls = (map: UrlMap) =>
  Object.fromEntries(Object.entries(map).map(([path, url]) => [path.split("/").pop()!.replace(/\.\w+$/, ""), url]));

const sprites = urls(
  import.meta.glob<string>("../../../Mush/clients/iso/gfx/anim/perso/*_{face,faec,back}.png", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
const portraits = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/portraits/*.png", { eager: true, query: "?url", import: "default" }),
);

// Small pixelated character busts (icons/ui, named by first name, which is our CharacterId).
const busts = urls(
  import.meta.glob<string>(
    "../../../Mush/www/img/icons/ui/{chao,chun,eleesha,finola,frieda,gioele,hua,ian,janice,jinsu,kuanti,paola,raluca,roland,stephen,terrence}.png",
    { eager: true, query: "?url", import: "default" },
  ),
);

// Full-length character art for the inspector (the files not listed here are site art, not crew).
const characterArt = urls(
  import.meta.glob<string>(
    "../../../Mush/www/img/art/char/{wang_chao,zhong_chun,eleesha_williams,finola_keegan,frieda_bergmann,gioele_rinaldo,jiang_hua,ian_soulton,janice_kent,kim_jin_su,lai_kuan_ti,paola_rinaldo,raluca_tomescu,roland_zuccali,stephen_seagull,terrence_archer}.jpg",
    { eager: true, query: "?url", import: "default" },
  ),
);

// Portrait files use full names; jinsu's face strip has a typo in the archive.
const PORTRAIT_FILE: Record<CharacterId, string> = {
  chao: "wang_chao",
  chun: "zhong_chun",
  eleesha: "eleesha_williams",
  finola: "finola_keegan",
  frieda: "frieda_bergmann",
  gioele: "gioele_rinaldo",
  hua: "jiang_hua",
  ian: "ian_soulton",
  janice: "janice_kent",
  jinsu: "kim_jin_su",
  kuanti: "lai_kuan_ti",
  paola: "paola_rinaldo",
  raluca: "raluca_tomescu",
  roland: "roland_zuccali",
  stephen: "stephen_seagull",
  terrence: "terrence_archer",
};

/** Unknown characters (e.g. a game saved before characters existed) fall back to a generic crew sprite. */
export function spriteStrip(character: CharacterId | undefined, facing: "face" | "back"): string {
  const file = character === "jinsu" && facing === "face" ? "jinsu_faec" : `${character}_${facing}`;
  return sprites[file] ?? sprites[`crew_male_${facing}`]!;
}

export function portrait(character: CharacterId | undefined): string {
  return (character && portraits[PORTRAIT_FILE[character]]) || portraits["shadow"]!;
}

/** Small pixelated character bust, for the minimap. Unknown characters get the generic portrait. */
export function bustIcon(character: CharacterId | undefined): string {
  return (character && busts[character]) || portrait(character);
}

// The cast sheet (RGBA, so no keying): per character a row of 48px-tall cells at x=127 (walk frames), then a lying pose.
const castSheet = Object.values(
  import.meta.glob<string>("../../../Mush/www/img/art/char.png", { eager: true, query: "?url", import: "default" }),
)[0]!;
const CAST_SHEET_SIZE = { w: 953, h: 2315 };
const LYING = { x: 554, w: 50, h: 48 };
/** The original iso client's frame for the lying pose (Data.hx `_LAID`): wider than `LYING`, and centred 3px further left. The beds' `ofsx`/`ofsy` were set for this frame, and `_LAID_FLIPPED` mirrors it. */
const LAID = { x: 544, w: 64 };
/** Row of each character on the cast sheet (found by pixel-matching the walk strips). */
const CAST_ROW: Record<CharacterId, number> = {
  jinsu: 0, frieda: 1, kuanti: 2, janice: 3, roland: 4, hua: 5, paola: 6, chao: 7,
  finola: 8, stephen: 9, ian: 10, chun: 11, raluca: 12, gioele: 13, eleesha: 14, terrence: 15,
};

/** The character lying down, as a crop of the cast sheet: CSS `background` pieces plus the crop's aspect ratio. */
export function lyingSprite(character: CharacterId | undefined) {
  if (!character) return undefined;
  const y = CAST_ROW[character] * LYING.h;
  return {
    backgroundImage: `url(${castSheet})`,
    backgroundSize: `${(CAST_SHEET_SIZE.w / LYING.w) * 100}% auto`,
    backgroundPosition: `${(LYING.x / (CAST_SHEET_SIZE.w - LYING.w)) * 100}% ${(y / (CAST_SHEET_SIZE.h - LYING.h)) * 100}%`,
    aspectRatio: `${LYING.w} / ${LYING.h}`,
  };
}

/** The lying pose as a pixel frame of the cast sheet, for drawing at 1x in the iso view and hit-testing it. */
export function lyingFrame(character: CharacterId | undefined) {
  if (!character) return undefined;
  return { url: castSheet, sx: LAID.x, sy: CAST_ROW[character] * LYING.h, width: LAID.w, height: LYING.h };
}

/**
 * The character seated, facing the camera or away from it, as a pixel frame of the cast sheet. Each row
 * starts with four 32x48 frames: standing facing, standing back, sitting facing, sitting back. They face
 * down-right and up-left; the other two directions are these mirrored (the caller flips).
 */
export function sittingFrame(character: CharacterId | undefined, facing: "face" | "back") {
  if (!character) return undefined;
  return { url: castSheet, sx: facing === "face" ? 64 : 96, sy: CAST_ROW[character] * LYING.h, width: 32, height: 48 };
}

/** The character standing, facing the camera (first 32x48 frame of its cast-sheet row), as CSS for a `scale`x pixel-exact crop. */
export function standingSprite(character: CharacterId | undefined, scale = 1) {
  if (!character) return undefined;
  return {
    width: 32 * scale,
    height: 48 * scale,
    backgroundImage: `url(${castSheet})`,
    backgroundSize: `${CAST_SHEET_SIZE.w * scale}px ${CAST_SHEET_SIZE.h * scale}px`,
    backgroundPosition: `0 ${-CAST_ROW[character] * 48 * scale}px`,
    imageRendering: "pixelated" as const,
  };
}

/** Full-length character illustration (about 210x300), or undefined for an unknown character. */
export function characterImage(character: CharacterId | undefined): string | undefined {
  return character && characterArt[PORTRAIT_FILE[character]];
}

// All 152 item icons (50x50 JPGs on the original blue tile). Not archive/: older duplicates of some names.
const itemIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/items/*.jpg", { eager: true, query: "?url", import: "default" }),
);

// Hand-made icons (Mush/derived/items/, adaptations of the originals). A name shared with an original replaces it.
Object.assign(
  itemIcons,
  urls(import.meta.glob<string>("../../../Mush/derived/items/*.{jpg,png}", { eager: true, query: "?url", import: "default" })),
);

/** Every item icon, keyed by file name without extension (e.g. "wrench", "fruit_banana"). */
export const ITEM_ICONS: Readonly<Record<string, string>> = itemIcons;

/** Item types whose icon file has a different name. ration_0 is the plain unopened box; ration_1 is the cooked one; ration_7 is a cup of coffee. */
const ICON_FILE: Readonly<Record<string, string>> = { input_tube: "thick_tube", output_tube: "thick_tube", uncooked_ration: "ration_0", alien_steak: "ration_5", coffee: "ration_7", oscilloscope: "wavoscope", steroids: "ration_6", anabolics: "ration_6", drill: "driller", thermosensor: "heat_seeker", support_drone: "help_drone", customized_blaster: "blaster", duct_tape: "duck_tape", block_of_post_it: "postit_bloc", scooter: "antigrav_scooter", sniper_helmet: "aiming_helmet" };

/** Icon for an item type. Item type ids are named after their icon files unless ICON_FILE says otherwise; undefined if there's none. */
export function itemIcon(type: string): string | undefined {
  return itemIcons[ICON_FILE[type] ?? type];
}

/** A planted hydropot's icon, by species (its fruit's item type): the original's tree_* / fruit_tree* icons. */
const PLANT_ICON_FILE: Readonly<Record<string, string>> = {
  fruit_banana: "tree_banana",
  fruit01: "fruit_tree01",
  fruit02: "fruit_tree02",
  fruit03: "fruit_tree03",
  fruit04: "fruit_tree04",
  fruit05: "fruit_tree05",
  fruit06: "fruit_tree06",
  fruit07: "fruit_tree07",
  fruit08: "fruit_tree08",
  fruit09: "fruit_tree09",
  fruit10: "fruit_tree10",
  fruit11: "fruit_tree11",
  fruit12: "fruit_tree12",
};

/** Icon for an item as the view has it: a planted hydropot shows its plant. */
export function itemViewIcon(item: Pick<ItemView, "type" | "plant">): string | undefined {
  const plant = item.plant && itemIcons[PLANT_ICON_FILE[item.plant.species] ?? ""];
  return plant ?? itemIcon(item.type);
}

/** The plain blue tile the original showed for an empty inventory slot. */
export const EMPTY_SLOT_ICON = itemIcons["empty"]!;

const design = urls(
  import.meta.glob<string>("../../../Mush/www/img/design/{pa1,pa2,lifebar,lifebar2,bdd,bdd_off}.png", { eager: true, query: "?url", import: "default" }),
);

/** Research cards, keyed by the lowercase research id (the file name). */
export const RESEARCH_CARDS = urls(
  import.meta.glob<string>("../../../Mush/www/img/cards/research/*.png", { eager: true, query: "?url", import: "default" }),
);

/** NERON project cards, keyed by the lowercase project id (the file name). */
export const PROJECT_CARDS = urls(
  import.meta.glob<string>("../../../Mush/www/img/cards/projects/*.png", { eager: true, query: "?url", import: "default" }),
);

/** PILGRED's card, shown in its terminal window. */
export const PILGRED_CARD: string = urls(
  import.meta.glob<string>("../../../Mush/www/img/cards/pilgred.png", { eager: true, query: "?url", import: "default" }),
)["pilgred"]!;

const astroIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/astro/{tag_*,planet_?,planet_?_small}.png", { eager: true, query: "?url", import: "default" }),
);

/** A planet sector's tag icon, by tag id (`tag_unknown` for a sector not revealed yet). */
export const planetTagIcon = (tag: string | null): string => astroIcons[`tag_${(tag ?? "unknown").toLowerCase()}`] ?? astroIcons["tag_unknown"]!;

/** The five small planet pictures; which one a planet gets is cosmetic. */
export const PLANET_IMAGES: readonly string[] = [0, 1, 2, 3, 4].map((n) => astroIcons[`planet_${n}_small`]!);

/** The large picture of the planet the ship orbits (`navigation.orbitPicture`), seen from the ship; null out of orbit. */
export const orbitImage = (picture: number | null): string | null => (picture === null ? null : (astroIcons[`planet_${picture}`] ?? null));

const titleIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/title_0{1,2,3}.png", { eager: true, query: "?url", import: "default" }),
);
/** The ID cards the original showed for its three titles. */
export const TITLE_ICONS: Readonly<Record<TitleId, string>> = {
  commander: titleIcons["title_01"]!,
  neron_admin: titleIcons["title_02"]!,
  comms_officer: titleIcons["title_03"]!,
};

/** A broken-equipment marker (the original's), beside "Broken" in the inspect panel. */
export const BROKEN_ICON = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/broken.png", { eager: true, query: "?url", import: "default" }),
)["broken"]!;

/** A flame (the original's), on the notice that your room is on fire. */
export const FIRE_ICON = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/fire.png", { eager: true, query: "?url", import: "default" }),
)["fire"]!;

/** A gold star (the original's): one per difficulty level in the lobby's character picker, grayed out when empty. */
export const STAR_ICON = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/star.png", { eager: true, query: "?url", import: "default" }),
)["star"]!;

/** A small trash bin, for deleting things. */
export const BIN_ICON = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/bin.png", { eager: true, query: "?url", import: "default" }),
)["bin"]!;

/** Blue gem with a pink core, drawn beside an action's label. */
export const ACTION_ICON = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/pa_slot1.png", { eager: true, query: "?url", import: "default" }),
)["pa_slot1"]!;

/** Marks a warning in the room log: a secret or covert action that got out, or an alarm. */
export const WARNING_ICON = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/att.png", { eager: true, query: "?url", import: "default" }),
)["att"]!;

const visibilityIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/{lock,camera,discrete}.png", { eager: true, query: "?url", import: "default" }),
);
/** Drawn after an action's label when others don't simply see it: a padlock, a hand hushing, a camera (only a camera reveals covert actions). */
export const VISIBILITY_ICONS: Readonly<Record<"private" | "secret" | "covert", string>> = {
  private: visibilityIcons["lock"]!,
  secret: visibilityIcons["discrete"]!,
  covert: visibilityIcons["camera"]!,
};

/** 5x5 pips from the original site: pink for action points, cyan for movement points. */
export const AP_PIP = design["pa1"]!;
export const MP_PIP = design["pa2"]!;
/** 3x5 pips from the original site: green for health, yellow-brown for morale. */
export const HP_PIP = design["lifebar"]!;
export const MORALE_PIP = design["lifebar2"]!;
/** 36x28 Xyloph database cells: deciphered, and not yet deciphered. */
export const XYLOPH_DONE = design["bdd"]!;
export const XYLOPH_TODO = design["bdd_off"]!;
/** 70x65 rebel base icons. The art is generic colony skylines; base01..06 follow the order of `REBEL_BASES` (the original's data sheet has ten slots, six live). */
const baseIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/bases/base0[1-6].png", { eager: true, query: "?url", import: "default" }),
);
export const REBEL_BASE_ICONS: Readonly<Record<RebelBaseId, string>> = Object.fromEntries(
  REBEL_BASES.map((id, i) => [id, baseIcons[`base0${i + 1}`]!]),
) as Record<RebelBaseId, string>;
/** 11x13 heart and face icons, for the HP and morale chips (the 3x5 bar pips are too small to read alone). */
const statIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/{lp,moral}.png", { eager: true, query: "?url", import: "default" }),
);
export const HP_ICON = statIcons["lp"]!;
export const MORALE_ICON = statIcons["moral"]!;

// Tab icons (16x16-ish pixel art). Keys are the names the user chose; see docs/assets/tab-icons.md.
const uiIcons = urls(
  import.meta.glob<string>(
    "../../../Mush/www/img/icons/ui/{mush,mush_progressive,starter,o2,fuel,plasma,alert,p_alive,survival,awake,comm,learned,stock,microsc,neron,info,infoalert,local,planet,conceptor,talkie,shield,basicplus,goldplus,notebook,pa_cook,pa_garden,plant_youngling,plant_thirsty,plant_dry,plant_diseased,sat,pa_pilgred,pam,pa_heal,pa_eng,pa_exp,pa_comp,pa_core,pa_shoot,hunter,private,search,spore,talk,wall,fav,triumph,heavy,charge,dead,check,uncheck,rebellion,food_unstable,food_hazardous,food_decaying}.{png,gif}",
    { eager: true, query: "?url", import: "default" },
  ),
);

/** Satiety icon, for what an item does when eaten. */
export const SATIETY_ICON = uiIcons["sat"]!;

/** Ship resource icons (14-16px pixel art) for the top bar's resources card; the hull reuses the gold `shield` icon. */
export const SHIP_RESOURCE_ICONS: Readonly<Record<"oxygen" | "fuel" | "hull" | "plasmaShield" | "hunters" | "fires" | "alerts", string>> = {
  oxygen: uiIcons["o2"]!,
  fuel: uiIcons["fuel"]!,
  hull: uiIcons["shield"]!,
  plasmaShield: uiIcons["plasma"]!,
  hunters: uiIcons["hunter"]!,
  fires: FIRE_ICON,
  alerts: uiIcons["alert"]!,
};

/** The ticked and empty boxes of a checklist (a research terminal's requirements, a project's skills). */
/**
 * Each signal kind's icon, in the Signals list and beside its lines in a conversation (owner, 2026-11-16: merchants use
 * the inventory icon). Rebel bases use the original's 16px rebellion icon; their 70x65 base art is too big for a row.
 */
export const SIGNAL_KIND_ICONS = { merchant: uiIcons["stock"]!, rebel: uiIcons["rebellion"]! } as const;
export const CHECK_ICON = uiIcons["check"]!;
export const UNCHECK_ICON = uiIcons["uncheck"]!;

/** The marker beside iTrackie entries that come from the ship rather than a person. */
export const INFO_ICON = uiIcons["info"]!;

/** A person you can see is somewhere but can't identify (ACTOPI off). */
export const MUSH_ICON = uiIcons["mush"]!;

/** A dead crew member's marker (the skull). */
export const DEAD_ICON = uiIcons["dead"]!;

// End screen banners (785x294), one per ending; the user chose which goes with which (2026-10-22).
const endArt = urls(
  import.meta.glob<string>("../../../Mush/www/img/art/{end,eden,destroyed}.jpg", { eager: true, query: "?url", import: "default" }),
);
export const ENDING_ART: Readonly<Record<Ending, string>> = {
  sol: endArt["end"]!,
  eden: endArt["eden"]!,
  humans_dead: endArt["destroyed"]!,
  ship_destroyed: endArt["destroyed"]!,
};

// Status effect icons (16x16 pixel art), keyed by status id (shared/src/statuses.ts).
const statusIconFiles = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/status/{dirty,belly_full,hungry,immune,pacifist,hyperactive,unsociable,germaphobic,guardian,disabled,paria,disease,hurt,sleepy,genius_idea,moduling,demoralized,pregnant}.png", { eager: true, query: "?url", import: "default" }),
);
const diseaseStatusIcons = Object.fromEntries(DEFAULT_CONFIG.diseases.allDiseases.map((id) => [id, statusIconFiles["disease"]!]));
const injuryStatusIcons = Object.fromEntries(DEFAULT_CONFIG.diseases.allInjuries.map((id) => [id, statusIconFiles["hurt"]!]));
// Mankind's Only Hope has no status icon in the original (it was a skill there), so its skill icon stands in;
// Bodyguard's statuses (protecting/protected) use Bodyguard's brick-wall skill icon (`unconcerned.png`).
const traitSkillIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/skills/{mankind_only_hope,unconcerned,nimble_fingers}.png", { eager: true, query: "?url", import: "default" }),
);
export const STATUS_ICONS: Readonly<Record<string, string>> = {
  ...diseaseStatusIcons,
  ...injuryStatusIcons,
  dirty: statusIconFiles["dirty"]!,
  full_belly: statusIconFiles["belly_full"]!,
  hungry: statusIconFiles["hungry"]!,
  immune: statusIconFiles["immune"]!,
  immunity: statusIconFiles["immune"]!,
  pacifist: statusIconFiles["pacifist"]!,
  hyperactive: statusIconFiles["hyperactive"]!,
  antisocial: statusIconFiles["unsociable"]!,
  germaphobe: statusIconFiles["germaphobic"]!,
  mankind_only_hope: traitSkillIcons["mankind_only_hope"]!,
  // The original's wheelchair icon (its `disabled` status), for the trait and for being pushed.
  wheelchair: statusIconFiles["disabled"]!,
  accommodated: statusIconFiles["disabled"]!,
  outcast: statusIconFiles["paria"]!,
  protecting: traitSkillIcons["unconcerned"]!,
  protected: traitSkillIcons["unconcerned"]!,
  guardian: statusIconFiles["guardian"]!,
  genius: statusIconFiles["genius_idea"]!,
  broken_nose_injury: statusIconFiles["hurt"]!,
  // The original's own inactivity icon (#145); super inactive is the same art turned red (STATUS_ICON_CLASSES).
  inactive: statusIconFiles["sleepy"]!,
  super_inactive: statusIconFiles["sleepy"]!,
  // The original's own status for using a terminal (MODULING, "Concentré"): a pair of glasses (#192).
  focused: statusIconFiles["moduling"]!,
  // At 0 morale (owner, 2026-11-11): the original's worried face. Its `suicidal` icon is left out on purpose.
  hopeless: statusIconFiles["demoralized"]!,
  // Nimble mode (Nimble Fingers): reuses the Nimble Fingers skill icon.
  nimble: traitSkillIcons["nimble_fingers"]!,
  pregnant: statusIconFiles["pregnant"]!,
};
/**
 * A class for a status icon that is another status's art recoloured at render time (owner, 2026-10-31, #145): no new
 * image file. `status-red` is a CSS hue rotation (base.css). Overhead badges are DOM in both renderers, so this covers PixiJS too.
 */
const STATUS_ICON_CLASSES: Readonly<Record<string, string>> = { super_inactive: "status-red" };
export function statusIconClass(id: string): string | undefined {
  return STATUS_ICON_CLASSES[id];
}
export function statusIcon(id: string): string {
  const icon = STATUS_ICONS[id];
  if (icon === undefined) throw new Error(`Missing icon for status "${id}"`);
  return icon;
}
/** Item attribute icons, keyed by attribute (the `itemAttr.*` locale keys). */
export const ITEM_ATTR_ICONS: Readonly<Record<"heavy", string>> = { heavy: uiIcons["heavy"]! };
export const CHARGES_ICON = uiIcons["charge"]!;
/** A plant's states, the original's plant_* status icons. */
export const PLANT_ICONS: Readonly<Record<"young" | "thirsty" | "dried" | "sick", string>> = {
  young: uiIcons["plant_youngling"]!,
  thirsty: uiIcons["plant_thirsty"]!,
  dried: uiIcons["plant_dry"]!,
  sick: uiIcons["plant_diseased"]!,
};
/** Contamination, as only Mush see it on humans (the original spore icon). */
export const CONTAMINATED_ICON = uiIcons["spore"]!;
/** Shielding on an item or equipment (Reinforce), as Engineers and Mush see it: the original shield icon. */
export const SHIELD_ICON = uiIcons["shield"]!;
/** How far perishable food has spoiled, as Chefs see it: the original's food_* status icons. */
export const SPOIL_ICONS: Readonly<Record<SpoilStage, string>> = {
  unstable: uiIcons["food_unstable"]!,
  hazardous: uiIcons["food_hazardous"]!,
  decomposing: uiIcons["food_decaying"]!,
};

// Skill icons (one per skill id, see shared/src/skills.ts).
const skillIcons = urls(import.meta.glob<string>("../../../Mush/www/img/icons/skills/*.png", { eager: true, query: "?url", import: "default" }));
// The designer skill was the original's conceptor, whose icon file keeps that name.
skillIcons["designer"] = skillIcons["conceptor"]!;
// Maintenance Agent takes the icon from the removed Dreamer (oisif) skill.
skillIcons["maintenance_agent"] = skillIcons["oisif"]!;
delete skillIcons["oisif"];
// Bodyguard takes Independent's (unconcerned) brick wall icon; Independent takes Daunting's icon.
skillIcons["bodyguard"] = skillIcons["unconcerned"]!;
skillIcons["unconcerned"] = skillIcons["daunting"]!;
delete skillIcons["daunting"];
// Infantryman takes the icon from the removed Crazy Eye skill.
skillIcons["infantryman"] = skillIcons["crazy_eye"]!;
delete skillIcons["crazy_eye"];
// Epigenetics takes Defacer's icon; Defacer falls back to the empty-slot icon.
skillIcons["epigenetics"] = skillIcons["defacer"]!;
delete skillIcons["defacer"];
export const skillIcon = (id: string): string => skillIcons[id] ?? EMPTY_SLOT_ICON;
/** Green jelly on an item or equipment, as Mush see it: the Electro-slime skill's icon. */
export const JELLY_ICON = skillIcons["electro_slime"]!;

/** The gold plus on an empty skill slot. */
export const GOLD_PLUS_ICON = uiIcons["goldplus"]!;

/** The spore resource. */
export const SPORE_ICON = uiIcons["spore"]!;

/** Icons for the extra point counters (shared/src/resources.ts). */
export const RESOURCE_ICONS: Readonly<Record<ResourceId, string>> = {
  eng: uiIcons["pa_eng"]!,
  exp: uiIcons["pa_exp"]!,
  comp: uiIcons["pa_comp"]!,
  garden: uiIcons["pa_garden"]!,
  core: uiIcons["pa_core"]!,
  shoot: uiIcons["pa_shoot"]!,
  cook: uiIcons["pa_cook"]!,
  heal: uiIcons["pa_heal"]!,
  pilgred: uiIcons["pa_pilgred"]!,
};

/** Two gears, on the settings button. */
export const SETTINGS_ICON = uiIcons["pam"]!;

/** Faction badges on the player summary. */
export const FACTION_ICONS = {
  human: uiIcons["p_alive"]!,
  alphaMush: uiIcons["starter"]!,
  betaMush: uiIcons["mush_progressive"]!,
};

/** The planet icon (ui/planet.png, 16px) on the top bar's ship status while orbiting or exploring (ShipStatus.tsx). */
export const SHIP_STATUS_PLANET_ICON = uiIcons["planet"]!;

export const TAB_ICONS = {
  research: uiIcons["microsc"]!,
  neronBios: uiIcons["neron"]!,
  notebook: uiIcons["notebook"]!,
  food: uiIcons["pa_cook"]!,
  botany: uiIcons["pa_garden"]!,
  pilgred: uiIcons["pa_pilgred"]!,
  health: uiIcons["pa_heal"]!,
  private: uiIcons["private"]!,
  items: uiIcons["search"]!,
  mushChat: uiIcons["spore"]!,
  graveyard: uiIcons["dead"]!,
  global: uiIcons["talk"]!,
  threads: uiIcons["wall"]!,
  favorites: uiIcons["fav"]!,
  goals: uiIcons["triumph"]!,
  neronProjects: uiIcons["conceptor"]!,
  globalLog: uiIcons["infoalert"]!,
  roomLog: uiIcons["local"]!,
  astrophysics: uiIcons["planet"]!,
  spaceCombat: uiIcons["shield"]!,
  features: uiIcons["basicplus"]!,
  comms: uiIcons["comm"]!,
  inventory: uiIcons["stock"]!,
  books: uiIcons["learned"]!,
  newChannel: uiIcons["goldplus"]!,
  itrackie: uiIcons["talkie"]!,
  inspect: uiIcons["search"]!,
  room: uiIcons["awake"]!,
  expeditions: uiIcons["survival"]!,
} as const;

/** The space battle sprite sheet (640x715). Its slices are in `Mush/clients/iso/xml/tiles.xml` (`<sheet src="BmpGfxFx">`). */
export const FX_SHEET = urls(
  import.meta.glob<string>("../../../Mush/clients/iso/gfx/fx.png", { eager: true, query: "?url", import: "default" }),
)["fx"]!;
/** Each hunter kind's battle-view slice in `FX_SHEET` (x, y, w, h), from the `FX_SPC_*` slices in tiles.xml. Keyed by
    `HunterType` (spider is the Arack, dice the D1000). They range from 48x26 (hunter) to 84x92 (D1000). */
export const HUNTER_SPRITES = {
  hunter: [378, 80, 48, 26],
  trax: [480, 49, 66, 46],
  spider: [547, 34, 76, 70],
  asteroid: [373, 330, 81, 72],
  dice: [492, 309, 84, 92],
} as const satisfies Record<string, readonly [number, number, number, number]>;
/** The same kinds' small slices (`FX_SPC_SMALL_*`, all 36x26), for lists where rows should stay even. */
export const HUNTER_SPRITES_SMALL = {
  hunter: [383, 83, 36, 26],
  trax: [487, 62, 36, 26],
  spider: [562, 57, 36, 26],
  asteroid: [396, 345, 36, 26],
  dice: [489, 321, 36, 26],
} as const satisfies Record<string, readonly [number, number, number, number]>;
/**
 * Each merchant kind's battle-view slices in `FX_SHEET` (owner, 2026-11-21): the original's trading ships
 * (`FX_TRANSPORT_0`, first frame of its 4, and `FX_TRANSPORT_SMALL_0`, 36x26 like the hunters' small slices).
 */
export const MERCHANT_SPRITES = { transport: [0, 441, 104, 70] } as const satisfies Record<MerchantTargetView["kind"], readonly [number, number, number, number]>;
export const MERCHANT_SPRITES_SMALL = { transport: [0, 461, 36, 26] } as const satisfies Record<MerchantTargetView["kind"], readonly [number, number, number, number]>;
/** The battle view's hp and charge icons in `FX_SHEET` (`FX_SPC_SHIELD`, `FX_SPC_CHARGE`). */
export const FX_SHIELD = [432, 80, 13, 13] as const;
export const FX_CHARGE = [433, 96, 10, 13] as const;

// 16px icons the ship card design shows: the score's triumph icon, the character and ship end markers, and highlights.
export const SHIP_CARD_ICONS: Readonly<Record<string, string>> = urls(
  import.meta.glob<string>(
    "../../../Mush/www/img/icons/ui/{triumph,calendar,eden1,mush,projects_done,research_done,survival,plasma,pa_pilgred}.png",
    { eager: true, query: "?url", import: "default" },
  ),
);

const crewIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/p_{alive,mush,cryo,dead,deadmush}.png", { eager: true, query: "?url", import: "default" }),
);
/** The original's 7x15 crew figures, one per seat in the crew bar (CrewBar.tsx). */
export const CREW_ICONS = {
  alive: crewIcons["p_alive"]!,
  mush: crewIcons["p_mush"]!,
  cryo: crewIcons["p_cryo"]!,
  dead: crewIcons["p_dead"]!,
  deadMush: crewIcons["p_deadmush"]!,
} as const;
