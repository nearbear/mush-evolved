import type { Modifier } from "../modifiers.ts";
import { careSkill } from "./careSkill.ts";

// Skill "first_aid" (Nurse), per the owner 2026-10-15: 2 care points each day and 2 when picked.
export const first_aid: Modifier = careSkill("nurseCarePointsPerDay");
