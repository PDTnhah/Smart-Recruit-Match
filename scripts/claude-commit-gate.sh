#!/bin/sh
# Claude Code PreToolUse hook (see .claude/settings.json, LESSONS §3).
# Runs the koni-harness work-commit gate only when the Bash command really invokes `git commit`.
# The settings `if: "Bash(git commit*)"` filter is best-effort: Claude Code still fires the hook
# for commands it cannot parse, and a failing gate would then block unrelated commands.
# Exit 2 blocks the tool call; exit 1 would only warn.
input=$(cat)
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
elif command -v node >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})')
else
  cmd=$input
fi
# `git [global options] commit`, not preceded by a path character (so .git/hooks/pre-commit does not match).
printf '%s\n' "$cmd" | grep -Eq '(^|[^[:alnum:]_./-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([^[:alnum:]_-]|$)' || exit 0
sh "$(git rev-parse --show-toplevel)/.koni-harness/gate-runner.sh" --phase work-commit >&2 || exit 2
