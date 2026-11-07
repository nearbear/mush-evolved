// A quick headless model of False Eden readings (docs/plans/balance.md, "False Eden and the
// star map"). Not a rule and not wired to config.ts: it models only the fork where the paths
// to True and False Eden split.
//
// Child 0 leads to True Eden, child 1 to False Eden, the rest to dead ends. Honest readers name
// child 0 with probability p, otherwise a uniformly random wrong child. Each Mush (or convert)
// claims child 1. One reading per reader per star. The crew follows the most-claimed child;
// ties break at random.
//
// Left out: AP budgets, who chooses to read, converts arriving mid-game, and a crew discounting
// readers it suspects.
//
// Run: npm run sim-readings -w tools

const TRIALS = 40000;
const ACCURACIES = [0.5, 0.6, 0.7, 0.8, 0.9];
const CHILDREN = [2, 3];
const HONEST = [3, 6, 10, 14];
const LIARS = [0, 1, 2, 3];

// A small seeded LCG, so runs are repeatable.
let seed = 12345;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

/** One fork: returns the child the crew picks. */
function trial(children: number, honest: number, liars: number, p: number): number {
  const votes = new Array<number>(children).fill(0);
  const vote = (child: number, n = 1) => {
    votes[child] = (votes[child] ?? 0) + n;
  };
  for (let i = 0; i < honest; i++) {
    if (rand() < p) vote(0);
    else vote(1 + Math.floor(rand() * (children - 1)));
  }
  vote(1, liars);
  const max = Math.max(...votes);
  const top = votes.flatMap((v, i) => (v === max ? [i] : []));
  return top[Math.floor(rand() * top.length)] ?? 0;
}

/** Share of trials that pick True Eden and False Eden. */
function run(children: number, honest: number, liars: number, p: number): [number, number] {
  let trueEden = 0;
  let falseEden = 0;
  for (let i = 0; i < TRIALS; i++) {
    const picked = trial(children, honest, liars, p);
    if (picked === 0) trueEden++;
    else if (picked === 1) falseEden++;
  }
  return [trueEden / TRIALS, falseEden / TRIALS];
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

for (const children of CHILDREN) {
  console.log(`\n=== Fork with ${children} children (chance level ${pct(1 / children).trim()}) ===`);
  console.log("Cell: True Eden picked / False Eden picked. Columns: honest reading accuracy p.");
  console.log(`honest liars | ${ACCURACIES.map((p) => `   p=${p}    `).join("|")}`);
  for (const honest of HONEST) {
    for (const liars of LIARS) {
      const cells = ACCURACIES.map((p) => {
        const [t, f] = run(children, honest, liars, p);
        return ` ${pct(t)} /${pct(f)} `;
      });
      console.log(`${String(honest).padStart(6)} ${String(liars).padStart(5)} | ${cells.join("|")}`);
    }
  }
}
