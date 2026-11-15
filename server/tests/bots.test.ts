import { applyAction, applyInput, breakDoor, DEFAULT_CONFIG, doorId, legalIn, shortestPath, startGame, viewFor, type Action, type LogLine, type RoomId } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { GoalBot, LogParrotBot, WanderBot } from "../src/bots.ts";
import { goTo } from "../src/bots/goals/blocks.ts";
import type { BotSocial, GoalDef } from "../src/bots/goals/index.ts";
import { seats } from "../src/testing/fakes.ts";

// End cycle on, as on the dev server; without it a bot waits for the clock instead.
const config = { ...DEFAULT_CONFIG, manualCycles: true };

describe("WanderBot", () => {
  const game = startGame({ seats: seats(0), config, seed: 1, rulesVersion: "test" });

  it("only ever chooses an action from its own view's legal actions", async () => {
    const view = viewFor(game, "p0");
    const bot = new WanderBot(7);
    for (let i = 0; i < 50; i++) {
      const action = await bot.decideAction(view);
      expect(legalIn(view)).toContainEqual(action);
    }
  });

  it("makes at most three moves per cycle, then ends its cycle", async () => {
    const base = viewFor(game, "p0");
    const view = { ...base, actions: base.actions.filter((o) => o.action.type === "ready").concat(base.actions.find((o) => o.action.type === "move")!) };
    const bot = new WanderBot(7);
    for (let i = 0; i < 3; i++) expect((await bot.decideAction(view)).type).toBe("move");
    expect(await bot.decideAction(view)).toEqual({ type: "ready" });
    expect((await bot.decideAction({ ...view, cycle: view.cycle + 1 })).type).toBe("move");
  });

  it("ends its cycle when it has no move to make", async () => {
    const base = viewFor(game, "p0");
    const view = { ...base, actions: base.actions.filter((o) => o.action.type === "ready") };
    expect(await new WanderBot(7).decideAction(view)).toEqual({ type: "ready" });
  });

  it("waits for the clock when End cycle is off", async () => {
    const clocked = startGame({ seats: seats(0), config: DEFAULT_CONFIG, seed: 1, rulesVersion: "test" });
    const view = { ...viewFor(clocked, "p0"), actions: [] };
    expect(await new WanderBot(7).decideAction(view)).toBeNull();
  });
});

describe("LogParrotBot", () => {
  const game = startGame({ seats: seats(0), config, seed: 1, rulesVersion: "test" });
  const base = viewFor(game, "p0");
  const priv: LogLine = { cycle: 2, key: "healed", params: { name: "Ann" }, visibleTo: ["p0"] };
  const pub: LogLine = { cycle: 2, key: "cycleBegins", visibleTo: "all" };

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

  it("doesn't repeat what it already posted before the room was evicted", () => {
    const said = { id: 0, cycle: 2, channel: "global" as const, from: base.you.id, isBot: true, text: "[cycle 2] healed (name=Ann)" };
    const view = { ...base, chatChannels: ["global" as const], log: [priv], chat: [said] };
    expect(new LogParrotBot().chatLines(view)).toEqual([]);
    expect(new LogParrotBot().chatLines({ ...view, log: [priv, priv] })).toHaveLength(1);
  });

  it("keeps entries for later when it can't post to global chat", () => {
    const bot = new LogParrotBot();
    const view = { ...base, chatChannels: [], log: [priv] };
    expect(bot.chatLines(view)).toEqual([]);
    expect(bot.chatLines({ ...view, chatChannels: ["global"] })).toHaveLength(1);
  });
});

describe("GoalBot social messages", () => {
  it("emits createChannel, postPlan, and shareReport through takeSocial", async () => {
    const config = { ...DEFAULT_CONFIG, manualCycles: true };
    let game = startGame({ seats: seats(0), config, seed: 1, rulesVersion: "test" });
    const messages: BotSocial[] = [
      { type: "createChannel", name: "crew", members: ["p1"] },
      {
        type: "postPlan",
        plan: {
          channel: "pc-1",
          room: "REFECTORY",
          purpose: "meal",
          slots: [{ kind: "onCall" }],
        },
      },
      { type: "shareReport", report: "exp-1", text: "safe" },
    ];
    let stepIndex = 0;
    const goalDef: GoalDef = {
      id: "testSocial",
      options: () => [
        {
          key: "testSocial",
          label: "testSocial",
          priority: 100,
          step: () => {
            const message = messages[stepIndex++];
            return message ? { kind: "social", message } : { kind: "done" };
          },
        },
      ],
    };
    const bot = new GoalBot({ state: 1 }, 2, [goalDef]);

    expect(await bot.decideAction(viewFor(game, "p0"))).toBeNull();
    const create = bot.takeSocial();
    expect(create).toEqual(messages[0]);
    expect(bot.takeSocial()).toBeNull();
    const created = applyInput(game, { ...create!, by: "p0" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    game = created.state;

    expect(await bot.decideAction(viewFor(game, "p0"))).toBeNull();
    const post = bot.takeSocial();
    expect(post).toEqual(messages[1]);
    const posted = applyInput(game, { ...post!, by: "p0" });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    game = posted.state;

    expect(await bot.decideAction(viewFor(game, "p0"))).toBeNull();
    expect(bot.takeSocial()).toEqual(messages[2]);
  });
});

describe("broken door routing", () => {
  it("reports a broken door on arrival and routes around it instead of walking back and forth", async () => {
    const rooms = DEFAULT_CONFIG.rooms;
    // Find A -> C -> D where breaking C|D forces C -> A -> ... -> D (the A->C->A->C loop if forgotten).
    let startRoom: RoomId | undefined;
    let midRoom: RoomId | undefined;
    let targetRoom: RoomId | undefined;
    outer: for (const a of Object.keys(rooms)) {
      for (const c of rooms[a] ?? []) {
        for (const d of rooms[c] ?? []) {
          if (d === a || (rooms[a] ?? []).includes(d)) continue;
          const direct = shortestPath(rooms, a, d);
          const around = shortestPath(rooms, c, d, (x, y) => doorId(x, y) !== doorId(c, d));
          if (direct?.length === 2 && direct[0] === c && direct[1] === d && around && around[0] === a) {
            startRoom = a;
            midRoom = c;
            targetRoom = d;
            break outer;
          }
        }
      }
    }
    expect(startRoom).toBeDefined();
    let game = startGame({ seats: seats(0), config, seed: 1, rulesVersion: "test" });
    const id = game.players[0]!.id;
    const p = game.players.find((x) => x.id === id)!;
    p.room = startRoom!;
    p.ap = 12;
    p.mp = 12;
    breakDoor(game, doorId(midRoom!, targetRoom!));

    const walkGoal: GoalDef = {
      id: "walkToTarget",
      priority: 10,
      options: (v) =>
        v.you.room === targetRoom
          ? []
          : [{ id: "walkToTarget", key: "walkToTarget", label: "walk", step: (v2) => goTo(v2, targetRoom!) ?? { kind: "done" } }],
    };
    const bot = new GoalBot(1, 0, [walkGoal]);
    const taken: Action[] = [];
    for (let t = 0; t < 30; t++) {
      const action = await bot.decideAction(viewFor(game, id));
      if (action === null || action.type === "ready") break;
      const res = applyAction(game, id, action);
      expect(res.ok).toBe(true);
      if (res.ok) game = res.state;
      taken.push(action);
    }

    expect(game.players.find((x) => x.id === id)!.room).toBe(targetRoom);
    expect(taken.some((a) => a.type === "report_door" && a.door === doorId(midRoom!, targetRoom!))).toBe(true);
    const moves = taken.filter((a): a is Extract<Action, { type: "move" }> => a.type === "move").map((a) => a.to);
    expect(moves.slice(0, 2)).toEqual([midRoom, startRoom]);
    expect(moves.at(-1)).toBe(targetRoom);
  });
});
