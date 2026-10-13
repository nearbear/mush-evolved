---
name: i18n
description: Keep the game translatable into English, French, and Spanish. Use whenever a change adds or edits player-visible text (UI labels, tooltips, aria-labels, log lines, error messages, item/equipment/room names, bot chat or prompts, chat moderation), adds a language, or when asked to translate or check i18n. Covers where strings live, how to write keys, what never to translate, and how to keep the i18n tests green.
---

# Internationalization

The UI language is a **per-player, client-side choice** (`web/src/i18n/`), independent of which ship the player joins. The server never knows it. The tests in `tools/src/i18n/` enforce the mechanical rules; this skill covers the judgment they can't.

## Rules

1. **No player-facing English in code.** In the client, use `const { t } = useTranslation()` and `t("area.key")`. Add the key to `web/src/locales/en.json` first, then `fr.json` and `es.json` in the same change. Keys are typed from `en.json`, so a typo fails typecheck.
2. **Whole sentences, never fragments.** One key per sentence with `{{placeholders}}` (`"Move to {{room}}"`). Never concatenate translated pieces, build a sentence from parts, or add "s" for plurals; word order and plural rules differ between languages.
3. **Plurals** use i18next suffixes and a `count` argument: `crew_one` / `crew_other` in English, plus `crew_many` in French and Spanish (the tests check this).
4. **Rules and server code emit ids and params, not sentences.** `shared` and `server` must not add new English text: use a structured log event, an error code, or an id the client turns into text. Existing English there is recorded debt in `tools/src/i18n/baseline.json`; don't add to it. Log-event params are data a player sees, so run the `leak-check` skill on them.
5. **Don't translate:** character names, language names (each is written in its own language), player chat, player names, "iTrackie" and "Mush". Put `i18n-ignore` in a comment on a line that must stay English, with the reason.
6. **Game terms:** be consistent (one translation per term across the catalog). The original game's French wording is in `Mush/data/DataExt.ods` (see `docs/mush-assets.md`); prefer it over inventing. Spanish has no source there, so ask the user about new game terms rather than guessing.
7. **Layout:** French and Spanish run about 20-30% longer. Don't use fixed widths or `white-space: nowrap` on text that is translated, and keep it working at 360px.
8. **Formatting:** numbers and dates go through `Intl` with the current language, not hand-built strings.
9. **Bots and moderation:** bot chat and prompts follow the ship's language, not the UI language. The chat word list is English-only and `\b` ignores accented letters (a known gap, `moderation.test.ts`); extend it per language rather than working around it.

## Workflow

1. Add the keys (en, then fr, es) and use `t()`.
2. `source ~/.nvm/nvm.sh && npm test -w tools -- i18n` and `npm test -w web`.
3. If the hardcoded-text baseline **shrank**, that's progress: `UPDATE_I18N_BASELINE=1 npm test -w tools -- i18n`. If it **grew**, translate the text or mark it `i18n-ignore`; never regenerate the baseline to make a failing test pass.
4. `npm run typecheck`.
5. Tell the user that the French and Spanish strings are drafts that need a native speaker's review, and list any new game terms you had to choose.
6. A visual check is only done when asked (`play` skill). When it is, mention that fr/es text length hasn't been checked unless someone switched the language first.

What is still untranslated is whatever `tools/src/i18n/baseline.json` lists; `docs/testing.md` section 7 says what is and isn't covered.
