// The daily repairs of D1: open `account_ships` rows (#285, `sweepShips`) and running-ships rows (#431, `sweepRunning`).
//
// `account_ships` (#285). A row is written before its seat (Matchmaker.board), so a crash between
// the two, a failed undo, a lost "you died" write or a D1 restore can leave an open row for a ship the account isn't
// aboard, and the account couldn't board anywhere. Joining already repairs its own row (GameRoom.resume); this catches
// the rest. It can't find a seat that has no row (a restore that lost rows).

import type { AccountStore } from "./accountStore.ts";
import { failure, logWarn } from "./log.ts";
import type { ShipStore } from "./shipStore.ts";

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
      logWarn("sweep_ask_failed", { roomId, ...failure(e) });
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

/**
 * Removes the rows of ships that aren't running (#431): a ship retired by a STATE_VERSION bump or one that crashed
 * mid-launch never ends, so it never deletes its own row. Each room is asked first (`GameRoom.running`); one that
 * can't be asked keeps its row. A row is written only after its launch is saved, so there is no grace period: a
 * room that says it isn't running never will be. Returns how many rows went.
 */
export async function sweepRunning(ships: ShipStore, running: (roomId: string) => Promise<boolean>): Promise<number> {
  let removed = 0;
  for (const roomId of await ships.roomIds()) {
    try {
      if (await running(roomId)) continue;
    } catch (e) {
      logWarn("sweep_ask_failed", { roomId, ...failure(e) });
      continue;
    }
    await ships.ended(roomId);
    removed++;
  }
  return removed;
}
