import { DEFAULT_CONFIG, startGame, viewFor, type LogEntry } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { LogParrotBot, WanderBot } from "./bots.ts";
import { seats } from "./testing/fakes.ts";

describe("WanderBot", () => {
  const game = startGame({ seats: seats(0), config: DEFAULT_CONFIG, seed: 1, rulesVersion: "test" });

  it("only ever chooses an action from its own view's legal actions", async () => {
    const view = viewFor(game, "p0");
    const bot = new WanderBot(7);
    for (let i = 0; i < 50; i++) {
      const action = await bot.decideAction(view);
      expect(view.legalActions).toContainEqual(action);
    }
  });

  it("makes at most three moves per cycle, then readies up", async () => {
    const base = viewFor(game, "p0");
    const view = { ...base, legalActions: [base.legalActions.find((a) => a.type === "move")!] };
    const bot = new WanderBot(7);
    for (let i = 0; i < 3; i++) expect((await bot.decideAction(view)).type).toBe("move");
    expect(await bot.decideAction(view)).toEqual({ type: "ready" });
    expect((await bot.decideAction({ ...view, cycle: view.cycle + 1 })).type).toBe("move");
  });

  it("readies up when it has no move to make", async () => {
    const view = { ...viewFor(game, "p0"), legalActions: [] };
    expect(await new WanderBot(7).decideAction(view)).toEqual({ type: "ready" });
  });
});

describe("LogParrotBot", () => {
  const game = startGame({ seats: seats(0), config: DEFAULT_CONFIG, seed: 1, rulesVersion: "test" });
  const base = viewFor(game, "p0");
  const priv: LogEntry = { cycle: 2, key: "healed", params: { name: "Ann" }, visibleTo: ["p0"] };
  const pub: LogEntry = { cycle: 2, key: "cycleBegins", visibleTo: "all" };

  it("never moves", async () => {
    expect(await new LogParrotBot().decideAction(base)).toEqual({ type: "ready" });
  });

  it("repeats each private log entry once, and ignores public ones", () => {
    const bot = new LogParrotBot();
    const view = { ...base, chatChannels: ["global" as const], log: [pub, priv] };
    expect(bot.chatLines(view)).toEqual(["[cycle 2] healed (name=Ann)"]);
    expect(bot.chatLines(view)).toEqual([]);
    expect(bot.chatLines({ ...view, log: [...view.log, priv] })).toHaveLength(1);
  });

  it("keeps entries for later when it can't post to global chat", () => {
    const bot = new LogParrotBot();
    const view = { ...base, chatChannels: [], log: [priv] };
    expect(bot.chatLines(view)).toEqual([]);
    expect(bot.chatLines({ ...view, chatChannels: ["global"] })).toHaveLength(1);
  });
});
