// Maps game ids to Motion Twin art in Mush/ (CC BY-NC-SA 4.0, see
// Mush/ATTRIBUTION.md). Vite bundles only the files matched here.

import type { CharacterId, RoomId } from "@mush2/shared";

type UrlMap = Record<string, string>;
const urls = (map: UrlMap) =>
  Object.fromEntries(Object.entries(map).map(([path, url]) => [path.split("/").pop()!.replace(/\.\w+$/, ""), url]));

const roomArt = urls(
  import.meta.glob<string>("../../../Mush/www/img/art/site/rooms/*.jpg", { eager: true, query: "?url", import: "default" }),
);
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

/**
 * Website illustrations exist per room type, not per room, and not for the
 * laboratory or nexus. Stopgap until the isometric view replaces them.
 */
const ROOM_ART: [prefix: string, file: string][] = [
  ["COMMAND_CENTER", "command_center"],
  ["SPACESHIP_BAY", "spaceship_bay"],
  ["SICK_BAY", "sick_bay"],
  ["REFECTORY", "refectory"],
  ["HYDROPONIC_CENTER", "hydroponic_center"],
  ["MOTOR_ROOM", "motor_room"],
  ["LASER_TURRET", "laser_turret"],
  ["CORRIDOR", "corridor"],
  ["ICARUS", "icarus"],
  ["BEDROOM", "bedroom"],
  ["STORAGE", "storage"],
];

export function roomImage(room: RoomId): string | undefined {
  const file = ROOM_ART.find(([prefix]) => room.startsWith(prefix))?.[1];
  return file ? roomArt[file] : undefined;
}

/** Unknown characters (e.g. a game saved before characters existed) fall back to a generic crew sprite. */
export function spriteStrip(character: CharacterId | undefined, facing: "face" | "back"): string {
  const file = character === "jinsu" && facing === "face" ? "jinsu_faec" : `${character}_${facing}`;
  return sprites[file] ?? sprites[`crew_male_${facing}`]!;
}

export function portrait(character: CharacterId | undefined): string {
  return (character && portraits[PORTRAIT_FILE[character]]) || portraits["shadow"]!;
}

const design = urls(
  import.meta.glob<string>("../../../Mush/www/img/design/{pa1,pa2}.png", { eager: true, query: "?url", import: "default" }),
);

/** 5x5 pips from the original site: pink for action points, cyan for movement points. */
export const AP_PIP = design["pa1"]!;
export const MP_PIP = design["pa2"]!;
