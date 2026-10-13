# Pre-share checklist

Written 2026-10-13 for a follow-up AI session. Goal: get the repo ready to share with other people. Nothing below is done yet.

## State found so far

Only a shallow check was done (file listing, `.gitignore`, tracked filenames, the remote). File contents and git history were **not** read.

- Remote: `origin` is `https://github.com/nearbear/mush2.git`. Whether it is public or private is unknown.
- No root `LICENSE` file. CLAUDE.md lists the code license as undecided (MIT is the likely choice).
- `Mush/LICENSE.txt` (CC BY-NC-SA 4.0) and `Mush/ATTRIBUTION.md` exist.
- `.gitignore` covers `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars`, `*.log`, `.screenshots/`.
- No tracked `.env` or secrets file. The only filename hits for "env/key/secret" were `web/.env.example`, `Mush/src/as/Keyboard.hx`, and `web/src/art/keyedSprite.ts`, which look harmless but were not opened.
- `.git` is 73M, probably mostly the Mush assets.
- `README.md` exists but was not reviewed.

## Must do

1. **Pick a code license.** Ask the user to choose (MIT likely), then add a root `LICENSE`. Keep it separate from the asset license in `Mush/LICENSE.txt`. Update CLAUDE.md's open decisions afterward.
2. **Scan for secrets, including git history.** Use `gitleaks`/`trufflehog` if available (ask before installing anything; CLAUDE.md says to ask before adding dependencies), or grep the history for API keys, tokens, `.dev.vars` contents. A secret removed from the tree is still in history. If one is found, tell the user to rotate it. Do not rewrite history without asking.
3. **Settle asset licensing.** Confirm no folder under `Mush/` has third-party terms that differ from CC BY-NC-SA 4.0, especially fonts, sounds, and music (see `docs/mush-assets.md`). Remove or exclude anything that cannot be redistributed. Reminder: non-commercial only, attribution required, adaptations must be shared under the same license.
4. **Find out whether the GitHub repo is public.** Ask the user. If it is already public, items 1-3 are urgent.

## Should do

5. **Review `README.md`.** It should cover setup (nvm in non-interactive shells, `npm install`, `npm run dev`), the code-vs-asset license split, and credit to eMush / Eternaltwin and Motion Twin.
6. **Review committed docs and config for anything private:** `docs/` (including `docs/ai-workflow.md`, which is large; per CLAUDE.md never read or rewrite it whole, only append with `cat >>`, so search it with grep instead), `docs/scratchpad/`, and `.claude/`. Everything committed becomes public. The user's email also appears in commit metadata.
7. **Say what is unfinished in the README.** Deploy (`npm run deploy -w server`) has never been run, and the bot model API is not chosen, so people should not expect a hosted game.

## Working agreements to follow

- Commit directly to `main`; never create or suggest a branch.
- Ask before adding dependencies.
- Confirm with the user before anything outward-facing (making the repo public, pushing, rewriting history).
- Run `npm run typecheck` and `npm test` before calling anything done if code changed.
- Append significant decisions to `docs/ai-workflow.md` with `cat >>`.
