import { chooseSkill } from "../skillChoice.ts";
import { act, failed, find, offered } from "./blocks.ts";
import type { GoalDef } from "./types.ts";

/** Fill an open skill slot (free) with the skill `chooseSkill` prefers for this character. Second in the scripted order. */
export const pickSkill: GoalDef = {
  id: "pickSkill",
  priority: 90,
  options(view, memory) {
    const choices = offered(view, "pick_skill").filter((o) => o.lacks.length === 0).map((o) => o.action.skill);
    const skill = chooseSkill(view.you.character, choices, view.you.skills, (n) => memory.roll(n));
    if (skill === null) return [];
    return [
      {
        id: "pickSkill",
        key: `pickSkill:${skill}`,
        step(v) {
          if (v.you.skills.includes(skill)) return { kind: "done" };
          const pick = find(v, "pick_skill", (a) => a.skill === skill);
          return pick ? act(pick) : failed("cant_pick");
        },
      },
    ];
  },
};
