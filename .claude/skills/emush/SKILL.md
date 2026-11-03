---
name: emush
description: Query upstream eMush (PHP) for game mechanics, numbers, and state transitions using clean-room extraction (npm run emush). Use when checking how original actions, items, or skills worked. Never read reference/emush directly; always use the clean-room tool to keep context clean and avoid AGPL code leakage.
---

# Querying upstream eMush (`npm run emush`)

`reference/emush/` is a gitignored reference checkout of the upstream eMush PHP repository.
Project settings explicitly **deny reading `reference/**` directly** to avoid context bloat and ensure clean-room copyright provenance.

Always query it via `npm run emush`:

## Commands

- `npm run emush -- check`
  Verifies that `reference/emush` exists and shows file counts.
- `npm run emush -- find <query>`
  Searches file paths and line matches without printing method bodies. Shows where classes and methods live.
- `npm run emush -- outline <file or class>`
  Extracts constants, docblocks, and method signatures (all function bodies stripped). Safe to view structure without seeing or copying algorithmic code.
- `npm run emush -- spec <topic or file>`
  Calls a headless distillation model (via `agy` / Gemini Flash) to convert the PHP code into a pure, clean-room Markdown specification:
  - Preconditions & AP costs
  - Formulas & exact percentages
  - State mutations & inventory effects
  - Public logs vs. secret logs
  - Edge cases

## Clean-Room Rules

1. **Behavioral Spec Only**: The output from `npm run emush -- spec` is input/evidence for how mechanics work, not code to paste.
2. **Pure TypeScript Implementation**: All code written for mush2 must be written from scratch matching mush2's functional architecture (`shared/src/rules.ts` pure state transitions).
3. **Never bypass denials**: Do not use shell workarounds or cat/grep directly on `reference/emush/` in the main session.
