---
name: gemini
description: Call Google Antigravity CLI (agy, a Gemini agent) in read-only file mode for a second opinion on a plan, a second leak or fr/es review, or to summarize large files or Mush/ images. Use whenever a task or another skill says to ask agy or Gemini. Never runs a shell.
---

# Asking Gemini (agy)

`~/.local/bin/agy` is optional: not every contributor has it. If it's missing or a call fails (auth, quota, model unavailable), say so and fall back to the built-in subagents (`Plan`, `Explore`, `visual-check`). Its view is input; the owner's decisions win.

## Use it for

- A second opinion on architecture plans: report where it disagrees and what changed.
- A second leak review after `leak-check`, and a check of new fr/es strings (see those skills).
- Summarizing large files, directories, or `Mush/` images, keeping them out of your context. Verify any lines you act on.
- Analysis it can't do from memory (for example usage numbers): it has no prices or file access beyond what you give it, so supply the data and say what's an assumption.

## The call

`~/.local/bin/agy -p "<prompt>" --mode plan --model <model> --print-timeout 300s`

Models: `gemini-4-argon-high` for reviews, `gemini-3.8-flash-medium` for reading. Not its Claude models. Run long calls in the background. Don't use it to read files you're denied or secrets.

## Read-only file mode, never a shell

Headless `-p` mode auto-denies agy's `run_command`, so a shell attempt gets no output (stderr says a tool "required the command permission"). Left to explore, it wanders (it has read `.git` files, and can stall for minutes). So:

1. Start every prompt with: "Read-only file mode. Use ONLY view_file, list_dir, grep_search, find_by_name. Never call run_command or any shell, never invoke or define subagents, never write or edit files, never use the browser or web."
2. Give it the files: name each absolute path to read, or paste the content into the prompt (70 KB pasted worked fine). List directories yourself first; its directory listing is unreliable. For big data, summarize it to a file in the scratchpad and name that file.
3. Never work around a denial with `--dangerously-skip-permissions` or by wrapping a shell in the prompt. If it needs something else, supply it.
4. Strip anything personal or secret from what you send (session titles, keys, `.env`). Sending it to Gemini is outward-facing.

To debug a stall, add `--output-format stream-json` and look at each step's `tool_name` and `error`.
