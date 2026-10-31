// The daily repair of `account_ships` (#285). A row is written before its seat (Matchmaker.board), so a crash between
// the two, a failed undo, a lost "you died" write or a D1 restore can leave an open row for a ship the account isn't
// aboard, and the account couldn't board anywhere. Joining already repairs its own row (GameRoom.resume); this catches
// the rest. It can't find a seat that has no row (a restore that lost rows).

import type { AccountStore } from "./accountStore.ts";

/** Rows younger than this are left alone: their join may still be under way. */
export const SWEEP_GRACE_MS = 10 * 60 * 1000;

/** Asks each ship with open rows which accounts it really has aboard, and closes the other rows. Returns how many. */
export async function sweepShips(
  store: AccountStore,
  seatAccounts: (roomId: string) => Promise<string[]>,
  now: number,
): Promise<number> {
  const byRoom = new Map<string, string[]>();
  for (const { accountId, roomId } of await store.openShips(now - SWEEP_GRACE_MS)) {
    byRoom.set(roomId, [...(byRoom.get(roomId) ?? []), accountId]);
  }
  let closed = 0;
  for (const [roomId, accounts] of byRoom) {
    let aboard: Set<string>;
    try {
      aboard = new Set(await seatAccounts(roomId));
    } catch (e) {
      console.warn(`Sweep couldn't ask a ship: ${e instanceof Error ? e.message : typeof e}`);
      continue;
    }
    for (const accountId of accounts) {
      if (aboard.has(accountId)) continue;
      await store.leaveShip(accountId, roomId, now);
      closed++;
    }
  }
  return closed;
}
