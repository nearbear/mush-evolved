// What a player sees of the relay state (relay.ts; docs/plans/archive/relay-tokens.md; research's samples, assay.ts):
// research and PILGRED token pools and progress, plus the currently offered NERON projects' progress and relay streak gain
// ranges (projects use no tokens). All progress, `waiting`, gains and tokens go only to the living in the target's room until
// complete; completion reaches every room (owner, 2026-10-31). Rolls and contamination never go out.

import { canWorkProject, canWorkResearch, cpuPriorityBonus } from "./bios.ts";
import { equipmentHere } from "./equipment.ts";
import { PILGRED_COMPLETE, PILGRED_SKILLS, pilgredTerminalsHere } from "./pilgred.ts";
import { offeredProjects } from "./projectEffects.ts";
import { PROJECT_COMPLETE, projectProgressConfig, projectSkills } from "./projects.ts";
import { researchProgress } from "./assay.ts";
import { contributionGain, poolProgress, relayGainRange, type RelayPool, type RelayProgressConfig, type RelayStreak, type ResearchPool } from "./relay.ts";
import { RESEARCH_COMPLETE, RESEARCH_IDS, RESEARCH_SKILLS, researchProgressConfig } from "./research.ts";
import type { SkillId } from "./skills.ts";
import type { GameState, PlayerState, RelayTargetView } from "./types.ts";

const EMPTY: RelayPool = { tokens: [] };
const EMPTY_RESEARCH: ResearchPool = { tokens: [], pending: [] };

/**
 * A research as seen from the lab (docs/plans/archive/research-sabotage.md): `waiting`, the gain and the sample values come from all
 * its samples, verified and pending, since that is what the next assay tests; `pending` is the striped segment. Nothing
 * says whether a sample is contaminated.
 */
function researchView(pool: Readonly<ResearchPool> | undefined, config: Readonly<RelayProgressConfig>, you: Readonly<PlayerState>, bonus: number): RelayTargetView {
  const p = pool ?? EMPTY_RESEARCH;
  const all = targetView({ tokens: [...p.tokens, ...p.pending] }, config, you, RESEARCH_SKILLS, RESEARCH_COMPLETE, bonus);
  const verified = p.tokens.length;
  return { ...all, pending: researchProgress(p, config, RESEARCH_COMPLETE).pending, tokens: all.tokens.map((t, i) => (i < verified ? t : { ...t, pending: true })) };
}

function targetView(pool: Readonly<RelayPool> | undefined, config: Readonly<RelayProgressConfig>, you: Readonly<PlayerState>, skills: readonly SkillId[], complete: number, bonus = 0): RelayTargetView {
  const p = pool ?? EMPTY;
  const { waiting, values } = poolProgress(p, config, complete);
  return { waiting, gain: contributionGain(p, config, you, skills, complete, bonus), tokens: p.tokens.map((t, i) => ({ by: t.by, value: values[i]! })) };
}

function streakEntry(streak: Readonly<RelayStreak> | undefined, config: Readonly<RelayProgressConfig>, you: Readonly<PlayerState>, skills: readonly SkillId[], bonus = 0): RelayTargetView {
  return { waiting: 0, gain: relayGainRange(config, you, skills, streak, bonus), tokens: [] };
}

/** Each target's percent for this viewer: all of them in its room, otherwise only the completed ones. */
function progressView(progress: Readonly<Record<string, number>>, here: boolean, complete: number): Record<string, number> {
  return Object.fromEntries(Object.entries(progress).filter(([, percent]) => here || percent >= complete));
}

/** The view's research, project and PILGRED fields for `you`. */
export function relayView(state: Readonly<GameState>, you: Readonly<PlayerState>) {
  const inLab = you.alive && canWorkResearch(state, you) && equipmentHere(state, you, "RESEARCH_LAB").length > 0;
  const atCore = you.alive && canWorkProject(state, you) && equipmentHere(state, you, "NERON_CORE").length > 0;
  const atPilgred = you.alive && pilgredTerminalsHere(state, you).length > 0;
  const research = state.config.research.progress;
  const project = state.config.project.progress;
  const researchBonus = cpuPriorityBonus(state, "research");
  const projectBonus = cpuPriorityBonus(state, "projects");
  const offered = atCore ? offeredProjects(state, you) : [];
  const offeredSet = new Set<string>(offered);
  const count = (pool: Readonly<RelayPool | ResearchPool> | undefined) => (pool ? [...pool.tokens, ...("pending" in pool ? pool.pending : [])].filter((t) => t.by === you.id).length : 0);
  const counts = (pools: Readonly<Record<string, RelayPool | ResearchPool>>) => Object.fromEntries(Object.entries(pools).flatMap(([id, pool]) => (count(pool) ? [[id, count(pool)]] : [])));
  return {
    research: progressView(state.research, inLab, RESEARCH_COMPLETE),
    projects: Object.fromEntries(Object.entries(state.projects).filter(([id, percent]) => percent >= PROJECT_COMPLETE || (atCore && offeredSet.has(id)))),
    pilgred: atPilgred ? state.pilgred.progress : null,
    relay: {
      research: inLab ? Object.fromEntries(RESEARCH_IDS.map((id) => [id, researchView(state.relay.research[id], researchProgressConfig(research, id), you, researchBonus)])) : {},
      projects: atCore ? Object.fromEntries(offered.map((id) => [id, streakEntry(state.relay.projects[id], projectProgressConfig(project, id), you, projectSkills(id), projectBonus)])) : {},
      pilgred: atPilgred ? targetView(state.pilgred.pool, state.config.pilgred.progress, you, PILGRED_SKILLS, PILGRED_COMPLETE, 0) : null,
    },
    // Your own tokens, wherever you are: your own information.
    yourTokens: { research: counts(state.relay.research), pilgred: count(state.pilgred.pool) },
  };
}
