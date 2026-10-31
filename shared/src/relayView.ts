// What a player sees of the relay token pools (relay.ts; docs/relay-tokens.md; research's samples, assay.ts). Research, project and PILGRED progress,
// `waiting`, the gain and the token list go only to the living in the target's room until it completes; completion is
// the only news that reaches other rooms (owner, 2026-10-31). Rolls never go out.

import { equipmentHere } from "./equipment.ts";
import { PILGRED_COMPLETE, PILGRED_SKILLS, pilgredTerminalsHere } from "./pilgred.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectSkills } from "./projects.ts";
import { researchProgress } from "./assay.ts";
import { contributionGain, poolProgress, type RelayPool, type RelayProgressConfig, type ResearchPool } from "./relay.ts";
import { RESEARCH_COMPLETE, RESEARCH_IDS, RESEARCH_SKILLS } from "./research.ts";
import type { SkillId } from "./skills.ts";
import type { GameState, PlayerState, RelayTargetView } from "./types.ts";

const EMPTY: RelayPool = { tokens: [] };
const EMPTY_RESEARCH: ResearchPool = { tokens: [], pending: [] };

/**
 * A research as seen from the lab (docs/research-sabotage.md): `waiting`, the gain and the sample values come from all
 * its samples, verified and pending, since that is what the next assay tests; `pending` is the striped segment. Nothing
 * says whether a sample is contaminated.
 */
function researchView(pool: Readonly<ResearchPool> | undefined, config: Readonly<RelayProgressConfig>, you: Readonly<PlayerState>): RelayTargetView {
  const p = pool ?? EMPTY_RESEARCH;
  const all = targetView({ tokens: [...p.tokens, ...p.pending] }, config, you, RESEARCH_SKILLS, RESEARCH_COMPLETE);
  const verified = p.tokens.length;
  return { ...all, pending: researchProgress(p, config, RESEARCH_COMPLETE).pending, tokens: all.tokens.map((t, i) => (i < verified ? t : { ...t, pending: true })) };
}

function targetView(pool: Readonly<RelayPool> | undefined, config: Readonly<RelayProgressConfig>, you: Readonly<PlayerState>, skills: readonly SkillId[], complete: number): RelayTargetView {
  const p = pool ?? EMPTY;
  const { waiting, values } = poolProgress(p, config, complete);
  return { waiting, gain: contributionGain(p, config, you, skills, complete), tokens: p.tokens.map((t, i) => ({ by: t.by, value: values[i]! })) };
}

/** Each target's percent for this viewer: all of them in its room, otherwise only the completed ones. */
function progressView(progress: Readonly<Record<string, number>>, here: boolean, complete: number): Record<string, number> {
  return Object.fromEntries(Object.entries(progress).filter(([, percent]) => here || percent >= complete));
}

/** The view's research, project and PILGRED fields for `you`. */
export function relayView(state: Readonly<GameState>, you: Readonly<PlayerState>) {
  const inLab = you.alive && equipmentHere(state, you, "RESEARCH_LAB").length > 0;
  const atCore = you.alive && equipmentHere(state, you, "NERON_CORE").length > 0;
  const atPilgred = you.alive && pilgredTerminalsHere(state, you).length > 0;
  const research = state.config.research.progress;
  const project = state.config.project.progress;
  const count = (pool: Readonly<RelayPool | ResearchPool> | undefined) => (pool ? [...pool.tokens, ...("pending" in pool ? pool.pending : [])].filter((t) => t.by === you.id).length : 0);
  const counts = (pools: Readonly<Record<string, RelayPool | ResearchPool>>) => Object.fromEntries(Object.entries(pools).flatMap(([id, pool]) => (count(pool) ? [[id, count(pool)]] : [])));
  return {
    research: progressView(state.research, inLab, RESEARCH_COMPLETE),
    projects: progressView(state.projects, atCore, PROJECT_COMPLETE),
    pilgred: atPilgred ? state.pilgred.progress : null,
    relay: {
      research: inLab ? Object.fromEntries(RESEARCH_IDS.map((id) => [id, researchView(state.relay.research[id], research, you)])) : {},
      projects: atCore ? Object.fromEntries(PROJECT_IDS.map((id) => [id, targetView(state.relay.projects[id], project, you, projectSkills(id), PROJECT_COMPLETE)])) : {},
      pilgred: atPilgred ? targetView(state.pilgred.pool, state.config.pilgred.progress, you, PILGRED_SKILLS, PILGRED_COMPLETE) : null,
    },
    // Your own tokens, wherever you are: your own information.
    yourTokens: { research: counts(state.relay.research), projects: counts(state.relay.projects), pilgred: count(state.pilgred.pool) },
  };
}
