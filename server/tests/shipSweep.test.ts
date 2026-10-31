import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../src/accountStore.ts";
import { SWEEP_GRACE_MS, sweepShips } from "../src/shipSweep.ts";
import { migratedDatabase } from "./sqliteD1.ts";

const T0 = 1_000_000_000_000;
let store: AccountStore;

async function account(name: string): Promise<string> {
  const created = await store.createAccount(name, "dev", name, T0);
  if (!created.ok) throw new Error(created.reason);
  return created.account.id;
}

beforeEach(() => {
  store = new AccountStore(migratedDatabase());
});

describe("sweepShips (#285)", () => {
  it("closes open rows whose ship doesn't have the account aboard, and keeps the rest", async () => {
    const [ann, bob, cat] = [await account("Ann"), await account("Bob"), await account("Cat")];
    await store.boardShip(ann, "r1", T0);
    await store.boardShip(bob, "r1", T0);
    await store.boardShip(cat, "r2", T0);
    const asked: string[] = [];
    const closed = await sweepShips(
      store,
      async (roomId) => {
        asked.push(roomId);
        // r1 has only Ann aboard (Bob's join half-failed); r2 ended.
        return roomId === "r1" ? [ann] : [];
      },
      T0 + SWEEP_GRACE_MS + 1,
    );
    expect(closed).toBe(2);
    expect(asked.sort()).toEqual(["r1", "r2"]);
    expect(await store.currentShip(ann)).toBe("r1");
    expect(await store.currentShip(bob)).toBeNull();
    expect(await store.currentShip(cat)).toBeNull();
  });

  it("leaves rows younger than the grace period: their join may be under way", async () => {
    const ann = await account("Ann");
    await store.boardShip(ann, "r1", T0);
    expect(await sweepShips(store, async () => [], T0 + SWEEP_GRACE_MS - 1)).toBe(0);
    expect(await store.currentShip(ann)).toBe("r1");
  });

  it("skips a ship it can't ask", async () => {
    const ann = await account("Ann");
    await store.boardShip(ann, "r1", T0);
    const closed = await sweepShips(store, async () => { throw new Error("down"); }, T0 + SWEEP_GRACE_MS + 1);
    expect(closed).toBe(0);
    expect(await store.currentShip(ann)).toBe("r1");
  });
});
