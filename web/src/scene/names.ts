import { SHIP_ROOMS, type RoomId } from "@mush2/shared";

const labels = new Map(SHIP_ROOMS.map((r) => [r.id, r.label]));

/** Display name for a room id, e.g. "CORRIDOR_A" -> "Corridor front". */
export const roomLabel = (room: RoomId) => labels.get(room) ?? room;
