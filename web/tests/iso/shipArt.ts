// ship-art.json with the hand-made sprites of ship-art-extra.json, as the game loads it (loadShip).
import { withExtraArt, type ExtraArt, type ShipArt } from "@mush2/shared";
import shipArtJson from "../../../Mush/derived/ship-art.json?raw";
import extraArt from "../../../Mush/derived/ship-art-extra.json";

export const shipArt = (): ShipArt => withExtraArt(JSON.parse(shipArtJson) as ShipArt, extraArt as ExtraArt);
