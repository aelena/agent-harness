---
name: git-commit
description: Create one git commit with a Conventional Commits message and an AI co-author trailer. Use when the user asks to commit, to save their changes to git, or picks one of the commit messages that were suggested.
argument-hint: "[commit message]"
disable-model-invocation: false
license: MIT
metadata:
  group: git
  version: "1.0"
---

# Commit

Create a single commit. Nothing else: no push, no amend, no branch change.

## Steps

1. **Look.** Run `git status --short`, `git diff HEAD --stat`, and `git log --oneline -5` (to match the repository's habits).
2. **Choose what goes in.** Stage the files that belong to this change by name. Do not use `git add -A`: leave out files that are unrelated, generated, or that look like secrets (`.env`, keys, credentials), and say which ones you left out.
3. **Write the message.** If `$ARGUMENTS` gives one, use it as written. Otherwise write it from the staged diff, following [`resources/commit-messages.md`](resources/commit-messages.md).
4. **Commit**, passing the message through a file or a heredoc so that quotes and newlines survive the shell. End the message with the co-author trailer below.
5. **If a hook rejects the commit**, read its output, fix the cause, and commit again. Do not pass `--no-verify`.
6. **Report** the commit hash and subject line.

## Co-author trailer

```text
Co-Authored-By: <model name and version> <<tool email>>
```

| Tool | Email |
| --- | --- |
| Claude Code | `noreply@anthropic.com` |
| Cursor | `cursoragent@cursor.com` |
| GitHub Copilot | `copilot@github.com` |
| Codex | `codex@openai.com` |

Example: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

If your environment already gives you an attribution line to use, use that one instead and do not add a second.

## Boundaries

- One commit per run. If the staged change mixes unrelated work, say so and propose how to split it before committing.
- An empty diff is not an error to work around: report that there is nothing to commit.
