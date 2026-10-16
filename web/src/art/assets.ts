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

/** Icon for an item type. Item type ids are named after their icon files; undefined if there's none. */
export function itemIcon(type: string): string | undefined {
  return itemIcons[type];
}

/** The plain blue tile the original showed for an empty inventory slot. */
export const EMPTY_SLOT_ICON = itemIcons["empty"]!;

const design = urls(
  import.meta.glob<string>("../../../Mush/www/img/design/{pa1,pa2,lifebar,lifebar2,bigslot}.png", { eager: true, query: "?url", import: "default" }),
);

/** Blue gem with a pink core, drawn beside an action's label. */
export const ACTION_ICON = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/pa_slot1.png", { eager: true, query: "?url", import: "default" }),
)["pa_slot1"]!;

/** The 56x56 empty inventory slot (a bordered blue square with transparent corners). */
export const EMPTY_SLOT_TILE = design["bigslot"]!;
/** 5x5 pips from the original site: pink for action points, cyan for movement points. */
export const AP_PIP = design["pa1"]!;
export const MP_PIP = design["pa2"]!;
/** 3x5 pips from the original site: green for health, yellow-brown for morale. */
export const HP_PIP = design["lifebar"]!;
export const MORALE_PIP = design["lifebar2"]!;

// Tab icons (16x16-ish pixel art). Keys are the names the user chose; see docs/tab-icons.md.
const uiIcons = urls(
  import.meta.glob<string>(
    "../../../Mush/www/img/icons/ui/{mush,mush_progressive,starter,p_alive,survival,awake,comm,learned,stock,microsc,neron,infoalert,local,planet,conceptor,talkie,shield,basicplus,goldplus,notebook,pa_cook,pa_garden,pa_pilgred,pam,pa_heal,pa_eng,pa_exp,pa_comp,pa_core,pa_shoot,private,search,spore,wall,fav,triumph}.{png,gif}",
    { eager: true, query: "?url", import: "default" },
  ),
);

/** A person you can see is somewhere but can't identify (ACTOPI off). */
export const MUSH_ICON = uiIcons["mush"]!;

// Status effect icons (16x16 pixel art), keyed by status id (shared/src/statuses.ts).
const statusIconFiles = urls(
  import.meta.glob<string>("../../../Mush/www/img/icons/ui/status/{dirty,belly_full,hungry}.png", { eager: true, query: "?url", import: "default" }),
);
export const STATUS_ICONS: Readonly<Record<"dirty" | "full_belly" | "hungry", string>> = {
  dirty: statusIconFiles["dirty"]!,
  full_belly: statusIconFiles["belly_full"]!,
  hungry: statusIconFiles["hungry"]!,
};

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
