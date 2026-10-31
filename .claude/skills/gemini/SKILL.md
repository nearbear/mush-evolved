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

Models: `gemini-3.8-flash-medium` by default (fr/es string checks, summaries, narrow bug reviews). `gemini-4-argon-high` only for architecture plan critiques and second leak reviews; its quota runs out. Not its Claude models. Don't use it to read files you're denied or secrets.

## Keeping quota use down

- Claude writes the plan; Gemini critiques it once. Don't have Gemini draft plans: its drafts needed rounds of full-context fixes, while its critiques found the real issues.
- Paste diffs and the relevant excerpts, not whole files, and tell it not to open files. Every call resends all its context, and exploring on its own causes stalls and reruns.
- Use `--print-timeout 600s` for any big review or design, so it finishes in one call instead of returning partial output that needs a rerun.
- Ask it to list the context it needs first only when the scope is unclear; otherwise paste the known files in the first call.

## Read-only file mode, never a shell

Headless `-p` mode auto-denies agy's `run_command`, so a shell attempt gets no output (stderr says a tool "required the command permission"). Left to explore, it wanders (it has read `.git` files, and can stall for minutes). So:

1. Start every prompt with: "Read-only file mode. Use ONLY view_file, list_dir, grep_search, find_by_name. Never call run_command or any shell, never invoke or define subagents, never write or edit files, never use the browser or web."
2. Give it the files: name each absolute path to read, or paste the content into the prompt (70 KB pasted worked fine). List directories yourself first; its directory listing is unreliable. For big data, summarize it to a file in the scratchpad and name that file.
3. Never work around a denial with `--dangerously-skip-permissions` or by wrapping a shell in the prompt. If it needs something else, supply it.
4. Strip anything personal or secret from what you send (session titles, keys, `.env`). Sending it to Gemini is outward-facing.

To debug a stall, add `--output-format stream-json` and look at each step's `tool_name` and `error`.

## Running it: wait on agy itself

Calls take minutes (a big prompt took the full 300s), so run `agy` as the whole Bash command with `run_in_background: true`, and redirect its output to a scratchpad file. Put the prompt in a file and pass `-p "$(cat prompt.txt)"`:

`~/.local/bin/agy -p "$(cat <scratchpad>/prompt.txt)" --mode plan --model <model> --print-timeout 600s > <scratchpad>/out.txt 2>&1`

- **Never** add a trailing `&`, a `( ... ) &` subshell, or `echo done` chaining inside the command. The harness then sees the wrapper exit at once and sends a "completed" notification while agy is still running; the real finish sends nothing, so you never react to it. With agy as the command, the "completed" notification is the real finish. Build the prompt file in a separate foreground call first.
- A "completed" notification means agy exited, not that it succeeded: read the output file. Check for a partial result (`print timeout after ... returning partial output`) and for an auth or permission error. For a big design or review use `--print-timeout 600s` or more; on a partial result, rerun asking only for the missing parts.
- If you got a "completed" notice but the output file is empty, agy is probably still running (`pgrep -f "bin/agy"`); don't tell the user it's done or "still running" without checking.
- Never `pkill -f "agy -p"` from a Bash call: the pattern matches that call's own shell and kills it. Use `pkill -f bin/agy` or kill the PID.
- The prompt is one command-line argument, so it must stay under about 125 KB (the Linux limit is 128 KB; `Argument list too long` means it was exceeded). Piped stdin is ignored. A fresh `agy -p` has no memory of earlier calls, so every call must carry all its context; trim by dropping files and telling it which were left out and that it may ask for them.
- Headless mode also denies `read_file`, so it cannot read files itself; pasting the content is the only way.
