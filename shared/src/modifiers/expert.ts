import type { Modifier } from "../modifiers.ts";

// The Expert Skill (owner, 2026-10-18): every action has 20% increase to success, dirty chance and Injury chance.
export const expert: Modifier = {
 actionSucessRate: (chance, { tags, state }) => (chance*1.2),
 actionDirtRate: (chance, { tags, state }) => (chance*1.2),
 actionInjuryRate: (chance, { tags, state }) => (chance*1.2),
};