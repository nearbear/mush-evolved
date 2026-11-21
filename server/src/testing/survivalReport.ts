// Development only: the survival harness's loss report (`npm run survival -w server -- --report`). Turns the runs'
// cycle rows (`CycleReport`, survival.ts) into the few numbers that say why ships were lost: what arrived against what
// the crew removed, what each hunter cost, how often anyone shot or patched, and where the AP went instead. Read it
// before changing a bot, and again after (the `bot-strategy` skill).

import type { CycleReport, SurvivalResult } from "./survival.ts";

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const per = (a: number, b: number, digits = 2): string => (b === 0 ? "-" : (a / b).toFixed(digits));

/** The hull under which bots patch it (`HULL_REPAIR_BELOW`), passed in so the report names the same line the bots use. */
/**
 * `fireHull`: the hull a burning room costs per cycle on average (`config.fire`: chance times mean damage), for the
 * estimate of the fires' share; the true split comes from a `--no-incidents` or `--no-hunters` run.
 */
export function lossReport(results: readonly SurvivalResult[], repairBelow: number, fireHull: number): string[] {
  const runs = results.filter((r) => r.cycles !== undefined);
  if (runs.length === 0) return ["loss report: these runs have no cycle rows (saved before the report existed)"];
  const rows = runs.flatMap((r) => r.cycles!);
  const total = (f: (row: CycleReport) => number): number => sum(rows.map(f));
  const n = runs.length;
  const arrived = total((r) => r.arrived);
  const killed = total((r) => r.killed);
  const shed = total((r) => r.shed);
  const left = sum(runs.map((r) => r.cycles!.at(-1)!.hunters));
  const shots = total((r) => r.shots);
  const hullLost = total((r) => r.hullLost);
  const hunterCycles = total((r) => r.hunters);
  const fireCycles = total((r) => r.fires ?? 0);
  const byFire = Math.min(hullLost, fireCycles * fireHull);
  const attacked = rows.filter((r) => r.hunters > 0 || r.killed > 0 || r.shed > 0);
  const quiet = attacked.filter((r) => r.shots === 0).length;
  const low = rows.filter((r) => r.hull < repairBelow);
  const lines = [
    `loss report, ${n} runs, ${rows.length} cycles (${attacked.length} with hunters outside)`,
    `hunters per run: arrived ${per(arrived, n, 1)}, killed ${per(killed, n, 1)}, shed by jumps ${per(shed, n, 1)}, outside at the end ${per(left, n, 1)}`,
    // The budget: the crew holds the hull only if it removes hunters as fast as they come.
    `budget per cycle: ${per(arrived, rows.length)} hunters arrive, ${per(killed + shed, rows.length)} removed (${per(killed, rows.length)} killed, ${per(shed, rows.length)} shed)`,
    `hull lost per run: ${per(hullLost, n, 1)}, of it about ${per(byFire, n, 1)} to fires (${per(fireCycles, rows.length, 1)} rooms burning per cycle) and ${per(hullLost - byFire, n, 1)} to hunters (${per(hullLost - byFire, hunterCycles)} per hunter per cycle); the split is an estimate`,
    // The same budget for fires (#429): rooms lit against fires put out.
    `fires per cycle: ${per(total((r) => r.firesStarted ?? 0), rows.length)} rooms catch fire, ${per(total((r) => r.firesOut ?? 0), rows.length)} put out, from ${per(total((r) => r.extinguishTries ?? 0), rows.length)} tries`,
    // Oxygen tanks (#443): each broken tank leaks oxygen every cycle until repaired.
    `oxygen tanks per run: ${per(total((r) => r.brokenTanks ?? 0), n, 1)} broken tank-cycles (oxygen leaked), ${per(total((r) => r.tankRepairs ?? 0), n, 1)} repairs from ${per(total((r) => r.tankRepairTries ?? 0), n, 1)} tries`,
    `hull patched per run: ${per(total((r) => r.repairs), n, 1)} patches from ${per(total((r) => r.repairTries), n, 1)} tries; ${low.length} cycles under ${repairBelow} hull`,
    `shooting: ${per(shots, attacked.length)} shots per cycle under attack, ${per(shots, killed, 1)} shots per kill, no shot in ${quiet} of ${attacked.length} cycles under attack`,
    `AP at cycle end: ${per(total((r) => r.apLeft), total((r) => r.alive))} per living bot, ${per(total((r) => r.atCap), rows.length)} bots at their cap`,
    `metal scrap at the end: ${per(sum(runs.map((r) => r.cycles!.at(-1)!.scraps)), n, 1)} aboard, ${per(sum(runs.map((r) => r.cycles!.at(-1)!.scrapsCarried)), n, 1)} carried`,
  ];
  for (const [who, key] of [["hunter-skill bots", "apShooters"], ["the other bots", "apOthers"]] as const) {
    const ap: Record<string, number> = {};
    for (const r of attacked) for (const [type, v] of Object.entries(r[key])) ap[type] = (ap[type] ?? 0) + v;
    const top = Object.entries(ap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    lines.push(`AP per cycle under attack, ${who}: ${top.map(([type, v]) => `${type} ${per(v, attacked.length)}`).join(", ") || "none"}`);
  }
  // Morale (#452): where the crew's morale went, by source, and how depression deaths cluster.
  const living = total((r) => r.alive);
  for (const [what, key] of [["gained", "moraleUp"], ["lost", "moraleDown"]] as const) {
    const by: Record<string, number> = {};
    for (const r of rows) for (const [k, v] of Object.entries(r[key] ?? {})) by[k] = (by[k] ?? 0) + v;
    const all = sum(Object.values(by));
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10);
    lines.push(`morale ${what} per living bot per day: ${per(all * runs[0]!.cyclesPerDay, living)} (${top.map(([k, v]) => `${k} ${per(v * runs[0]!.cyclesPerDay, living)}`).join(", ") || "none"})`);
  }
  const sad = runs.map((r) => r.deaths.filter((d) => d.cause === "depression"));
  const hit = sad.filter((d) => d.length > 0);
  const firstDay = hit.map((d) => d[0]!.day).sort((a, b) => a - b);
  // A cycle's depression deaths each cost the living crew morale, so the next cycle's are the chain.
  const waves = hit.flatMap((d) => [...new Set(d.map((x) => x.cycle))].map((c) => d.filter((x) => x.cycle === c).length));
  const chained = sum(hit.map((d) => d.filter((x) => d.some((y) => y.cycle < x.cycle && x.cycle - y.cycle <= 2)).length));
  lines.push(`depression: ${sum(sad.map((d) => d.length))} deaths in ${hit.length} runs, first on day ${firstDay[Math.floor(firstDay.length / 2)] ?? "-"} (median; earliest ${firstDay[0] ?? "-"}), ${waves.length} cycles with any (${per(sum(waves), waves.length, 1)} deaths each, most ${Math.max(0, ...waves)}), ${chained} within 2 cycles after an earlier one`);
  // HP (injury deaths, owner 2026-11-21): what took the crew's HP, and what dealt the last hit of each injury death.
  const hpBy: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.hpLost ?? {})) hpBy[k] = (hpBy[k] ?? 0) + v;
  const hpTop = Object.entries(hpBy).sort((a, b) => b[1] - a[1]).slice(0, 12);
  lines.push(`HP lost a run: ${per(sum(Object.values(hpBy)), n, 1)} (${hpTop.map(([k, v]) => `${k} ${per(v, n, 1)}`).join(", ") || "none"})`);
  const hits: Record<string, number> = {};
  for (const d of runs.flatMap((r) => r.deaths.filter((x) => x.cause === "injury"))) hits[d.hit ?? "unknown"] = (hits[d.hit ?? "unknown"] ?? 0) + 1;
  lines.push(`injury deaths by last hit: ${Object.entries(hits).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
  // Oxygen: what came in against the burn, and how far each run got along the planet pipeline before it ran dry.
  const withOxygen = rows.filter((r) => r.oxygen > 0);
  const inBy: Record<string, number> = {};
  for (const r of withOxygen) for (const [k, v] of Object.entries(r.oxygenIn ?? {})) inBy[k] = (inBy[k] ?? 0) + v;
  const day = runs[0]!.cyclesPerDay;
  lines.push(`oxygen in per day while any is left: ${per(sum(Object.values(inBy)) * day, withOxygen.length)} (${Object.entries(inBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${per(v * day, withOxygen.length)}`).join(", ") || "none"}), against ${day} burned and ${per(total((r) => r.brokenTanks ?? 0) * day, rows.length)} leaked`);
  const firstCycle = (r: SurvivalResult, f: (row: CycleReport) => boolean): number | null => r.cycles!.find(f)?.cycle ?? null;
  const median = (xs: readonly (number | null)[]): string => {
    const got = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
    return `${got.length} runs, median cycle ${got[Math.floor(got.length / 2)] ?? "-"}`; // i18n-ignore: dev-only harness report
  };
  lines.push(`coffee per run: ${per(total((r) => r.coffeePulled ?? 0), n, 1)} pulled, ${per(total((r) => r.coffeeJunkie ?? 0), n, 1)} drunk by a Caffeine Junkie, ${per(total((r) => r.coffeeOthers ?? 0), n, 1)} by others; ${per(total((r) => r.junkieMeals ?? 0), n, 1)} other meals for a Caffeine Junkie`);
  lines.push(`oxygen pipeline, first cycle: a planet found ${median(runs.map((r) => firstCycle(r, (c) => (c.planets ?? 0) > 0)))}; one with an Oxygen sector ${median(runs.map((r) => firstCycle(r, (c) => (c.oxygenPlanets ?? 0) > 0)))}; a destination shared ${median(runs.map((r) => firstCycle(r, (c) => (c.shares ?? 0) > 0)))}; a jump ${median(runs.map((r) => firstCycle(r, (c) => (c.jumps ?? 0) > 0)))}; in orbit ${median(runs.map((r) => firstCycle(r, (c) => c.orbit === true)))}; in orbit of an Oxygen planet ${median(runs.map((r) => firstCycle(r, (c) => c.orbitOxygen === true)))}; an expedition ${median(runs.map((r) => firstCycle(r, (c) => (c.expeditions ?? 0) > 0)))} (${per(total((r) => r.expeditions ?? 0), n, 1)} a run); oxygen from an expedition ${median(runs.map((r) => firstCycle(r, (c) => (c.oxygenIn?.expedition ?? 0) > 0)))}; oxygen at 0 ${median(runs.map((r) => firstCycle(r, (c) => c.oxygen === 0)))}`);
  // Jumps and orbits: why the ship moved when it did, and what each stay at a planet brought.
  const jumps = runs.flatMap((r) => r.jumpLog ?? []);
  if (jumps.length > 0) {
    const mid = (xs: readonly number[]): string => (xs.length === 0 ? "-" : String([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]));
    const kind = (j: (typeof jumps)[number]): string => (j.hunters >= 5 ? "hunters" : j.oxygen <= 8 ? "oxygen" : j.heldFor === null ? "no hold" : j.heldFor >= 4 * day ? "4 days" : "other");
    for (const [name, js] of [["to a planet", jumps.filter((j) => j.toPlanet)], ["escape", jumps.filter((j) => !j.toPlanet)]] as const) {
      const why: Record<string, number> = {};
      for (const j of js) why[kind(j)] = (why[kind(j)] ?? 0) + 1;
      lines.push(`jumps ${name}: ${per(js.length, n, 1)} a run; trigger ${Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}; held median ${mid(js.flatMap((j) => (j.heldFor === null ? [] : [j.heldFor])))} cycles; oxygen before median ${mid(js.map((j) => j.oxygen))}; planets held ${per(sum(js.map((j) => j.planets)), js.length, 1)} each, ${per(sum(js.map((j) => j.astroFree)), js.length, 1)} free astro slots${name === "to a planet" ? `; ${js.filter((j) => j.oxygenSectors > 0).length} to a planet with an Oxygen sector` : ""}`);
    }
  }
  const orbits = runs.flatMap((r) => (r.orbitLog ?? []).map((o) => ({ ...o, to: o.to ?? r.cycle })));
  if (orbits.length > 0) {
    const ox = orbits.filter((o) => o.oxygenSectors > 0);
    lines.push(`orbits: ${per(orbits.length, n, 1)} a run, ${per(sum(orbits.map((o) => o.to - o.from)), orbits.length, 1)} cycles each; with an Oxygen sector ${ox.length} (${per(sum(ox.map((o) => o.oxygenSectors)), ox.length, 1)} sectors each, ${per(sum(ox.map((o) => o.expeditions)), ox.length, 1)} expeditions, ${per(sum(ox.map((o) => o.oxygen)), ox.length, 1)} oxygen each); without ${orbits.length - ox.length}; cycles in orbit ${per(sum(orbits.map((o) => o.to - o.from)), rows.length)} of all`);
    const done = orbits.filter((o) => o.allExplored !== undefined);
    lines.push(`orbits explored out: ${done.length} of ${orbits.length}, staying ${per(sum(done.map((o) => o.to - o.allExplored!)), done.length, 1)} cycles after (${per(sum(done.map((o) => o.to - o.allExplored!)), n, 1)} a run, ${done.filter((o) => o.to - o.allExplored! >= 8).length} stays of a day or more)`);
  }
  lines.push(`fuel relay: ${per(total((r) => r.fuelAsked ?? 0), n, 1)} requests a run, ${per(total((r) => r.fuelReports ?? 0), n, 1)} answered by a helper, ${per(total((r) => r.commanderLoads ?? 0), n, 1)} capsules the Commander loaded himself, ${per(total((r) => r.loadFuelWalkAp ?? 0), n, 1)} AP helpers walked`);
  lines.push(`beds: ${per(total((r) => r.restWalkAp ?? 0), n, 1)} AP a run spent walking to rest; ${per(total((r) => r.lying ?? 0), rows.length, 1)} crew lying at a cycle's end`);
  // Bed tiers (Run A3): whether Pilots and the Commander get the beds, and whether they keep AP when it matters.
  const tierAlive = [0, 1, 2].map((i) => total((r) => r.tierAlive?.[i] ?? 0));
  const tierLying = [0, 1, 2].map((i) => total((r) => r.tierLying?.[i] ?? 0));
  const busy = rows.filter((r) => r.orbit === true || r.hunters > 0);
  lines.push(`bed tiers: lying at a cycle's end ${[0, 1, 2].map((i) => `tier ${i + 1} ${per(tierLying[i]! * 100, tierAlive[i]!, 0)}%`).join(", ")}; tier 1 at 2 AP or less ${per(total((r) => r.tier1Low ?? 0) * 100, tierAlive[0]!, 0)}% of their cycles, ${per(sum(busy.map((r) => r.tier1Low ?? 0)) * 100, sum(busy.map((r) => r.tierAlive?.[0] ?? 0)), 0)}% in orbit or under attack; ${per(total((r) => r.bedAsks ?? 0), n, 1)} bed requests and ${per(total((r) => r.bedYields ?? 0), n, 1)} beds given up a run; ${per(total((r) => r.patrolTakeoffs ?? 0), n, 1)} patrol takeoffs and ${per(total((r) => r.icarusLaunches ?? 0), n, 1)} Icarus launches a run`);
  // The Shrink's beds (Run A4): whether it lies down, how many beds stay empty, and who rests beside it.
  const shrinkAlive = total((r) => r.shrinks ?? 0);
  lines.push(`shrink beds: Shrinks lying at a cycle's end ${per(total((r) => r.shrinkLying ?? 0) * 100, shrinkAlive, 0)}%; ${per(total((r) => r.freeBeds ?? 0), rows.length, 2)} beds empty and ${per(total((r) => r.besideShrink ?? 0), rows.length, 2)} crew lying beside a Shrink at a cycle's end; ${per(total((r) => r.shrinkLines ?? 0), n, 1)} \`Shrink: in\` lines a run`);
  lines.push("by cycle (mean over the runs still going): cycle, runs, hull, hunters, fires, alive, oxygen, morale, at 0, at 3 or less");
  const last = Math.max(...rows.map((r) => r.cycle));
  for (let cycle = 4; cycle <= last; cycle += 4) {
    const at = rows.filter((r) => r.cycle === cycle);
    if (at.length === 0) continue;
    const mean = (f: (row: CycleReport) => number): string => per(sum(at.map(f)), at.length, 1);
    lines.push(`  ${cycle}, ${at.length}, ${mean((r) => r.hull)}, ${mean((r) => r.hunters)}, ${mean((r) => r.fires ?? 0)}, ${mean((r) => r.alive)}, ${mean((r) => r.oxygen)}, ${mean((r) => r.moraleMean ?? 0)}, ${mean((r) => r.hopeless ?? 0)}, ${mean((r) => r.moraleLow ?? 0)}`);
  }
  return lines;
}
