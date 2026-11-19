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
