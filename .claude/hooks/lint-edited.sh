#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): run `biome lint` on the file just edited, so a lint
# error shows up at once instead of in the end-of-task `npm run verify`.
# Reports only; never rewrites the file. Exit 2 feeds the errors back to Claude.
set -u

file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
	*.ts | *.tsx | *.js | *.jsx | *.css | *.json) ;;
	*) exit 0 ;;
esac
[ -f "$file" ] || exit 0

# Lint from the checkout the file lives in (the main one or a worktree), with its own biome.
root=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null) || exit 0
biome="$root/node_modules/.bin/biome"
[ -x "$biome" ] || exit 0

cd "$root" || exit 0
if ! out=$("$biome" lint --no-errors-on-unmatched --files-ignore-unknown=true "${file#"$root"/}" 2>&1); then
	{
		echo "biome lint found problems in ${file#"$root"/}:"
		echo "$out" | tail -n 60
		echo "(If this is mid-change, e.g. an import whose use comes in the next edit, carry on.)"
	} >&2
	exit 2
fi
exit 0
