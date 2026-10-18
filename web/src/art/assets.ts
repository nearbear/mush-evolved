// Maps game ids to Motion Twin art in Mush/ (CC BY-NC-SA 4.0, see
// Mush/ATTRIBUTION.md). Vite bundles only the files matched here.

import type { CharacterId, ResourceId } from "@mush2/shared";

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
  return { url: castSheet, sx: LYING.x, sy: CAST_ROW[character] * LYING.h, width: LYING.w, height: LYING.h };
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

/** Full-length character illustration (about 210x300), or undefined for an unknown character. */
export function characterImage(character: CharacterId | undefined): string | undefined {
  return character && characterArt[PORTRAIT_FILE[character]];
}

// All 152 item icons (50x50 JPGs on the original blue tile). Not archive/: older duplicates of some names.
const itemIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/items/*.jpg", { eager: true, query: "?url", import: "default" }),
);

/** Every item icon, keyed by file name without extension (e.g. "wrench", "fruit_banana"). */
export const ITEM_ICONS: Readonly<Record<string, string>> = itemIcons;

/** Item types whose icon file has a different name. ration_0 is the plain unopened box; ration_1 is the cooked one; ration_7 is a cup of coffee. */
const ICON_FILE: Readonly<Record<string, string>> = { uncooked_ration: "ration_0", coffee: "ration_7" };

/** Icon for an item type. Item type ids are named after their icon files unless ICON_FILE says otherwise; undefined if there's none. */
export function itemIcon(type: string): string | undefined {
  return itemIcons[ICON_FILE[type] ?? type];
}

/** The plain blue tile the original showed for an empty inventory slot. */
export const EMPTY_SLOT_ICON = itemIcons["empty"]!;

const design = urls(
  import.meta.glob<string>("../../../Mush/www/img/design/{pa1,pa2,lifebar,lifebar2,bigslot}.png", { eager: true, query: "?url", import: "default" }),
);

/** Research cards, keyed by the lowercase research id (the file name). */
export const RESEARCH_CARDS = urls(
  import.meta.glob<string>("../../../Mush/www/img/cards/research/*.png", { eager: true, query: "?url", import: "default" }),
);

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

/** The 56x56 empty inventory slot (a bordered blue square with transparent corners). */
export const EMPTY_SLOT_TILE = design["bigslot"]!;
/** 5x5 pips from the original site: pink for action points, cyan for movement points. */
export const AP_PIP = design["pa1"]!;
export const MP_PIP = design["pa2"]!;
/** 3x5 pips from the original site: green for health, yellow-brown for morale. */
export const HP_PIP = design["lifebar"]!;
export const MORALE_PIP = design["lifebar2"]!;
/** 11x13 heart and face icons, for the HP and morale chips (the 3x5 bar pips are too small to read alone). */
const statIcons = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/{lp,moral}.png", { eager: true, query: "?url", import: "default" }),
);
export const HP_ICON = statIcons["lp"]!;
export const MORALE_ICON = statIcons["moral"]!;

// Tab icons (16x16-ish pixel art). Keys are the names the user chose; see docs/tab-icons.md.
const uiIcons = urls(
  import.meta.glob<string>(
    "../../../Mush/www/img/icons/ui/{mush,mush_progressive,starter,o2,fuel,plasma,alert,p_alive,survival,awake,comm,learned,stock,microsc,neron,info,infoalert,local,planet,conceptor,talkie,shield,basicplus,goldplus,notebook,pa_cook,pa_garden,pa_pilgred,pam,pa_heal,pa_eng,pa_exp,pa_comp,pa_core,pa_shoot,private,search,spore,wall,fav,triumph,heavy,dead}.{png,gif}",
    { eager: true, query: "?url", import: "default" },
  ),
);

/** Ship resource icons (14-16px pixel art) for the top bar's resources card; the shield reuses the gold `shield` icon. */
export const SHIP_RESOURCE_ICONS: Readonly<Record<"oxygen" | "fuel" | "shields" | "plasmaShield" | "alerts", string>> = {
  oxygen: uiIcons["o2"]!,
  fuel: uiIcons["fuel"]!,
  shields: uiIcons["shield"]!,
  plasmaShield: uiIcons["plasma"]!,
  alerts: uiIcons["alert"]!,
};

/** The marker beside iTrackie entries that come from the ship rather than a person. */
export const INFO_ICON = uiIcons["info"]!;

/** A person you can see is somewhere but can't identify (ACTOPI off). */
export const MUSH_ICON = uiIcons["mush"]!;

// Status effect icons (16x16 pixel art), keyed by status id (shared/src/statuses.ts).
const statusIconFiles = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/status/{dirty,belly_full,hungry,immune,pacifist}.png", { eager: true, query: "?url", import: "default" }),
);
export const STATUS_ICONS: Readonly<Record<"dirty" | "full_belly" | "hungry" | "immune" | "immunity" | "pacifist", string>> = {
  dirty: statusIconFiles["dirty"]!,
  full_belly: statusIconFiles["belly_full"]!,
  hungry: statusIconFiles["hungry"]!,
  immune: statusIconFiles["immune"]!,
  immunity: statusIconFiles["immune"]!,
  pacifist: statusIconFiles["pacifist"]!,
};
/** Item attribute icons, keyed by attribute (the `itemAttr.*` locale keys). */
export const ITEM_ATTR_ICONS: Readonly<Record<"heavy", string>> = { heavy: uiIcons["heavy"]! };
/** Contamination, as only Mush see it on humans (the original spore icon). */
export const CONTAMINATED_ICON = uiIcons["spore"]!;

// Skill icons (one per skill id, see shared/src/skills.ts).
const skillIcons = urls(import.meta.glob<string>("../../../Mush/www/img/icons/skills/*.png", { eager: true, query: "?url", import: "default" }));
export const skillIcon = (id: string): string => skillIcons[id] ?? EMPTY_SLOT_ICON;

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
  global: uiIcons["wall"]!,
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
