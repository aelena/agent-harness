---
name: harness-audit
description: Audit how well a repository is set up for coding agents - instructions, docs, guardrails, feedback loops, verification - and report the gaps in order of payoff. Use when the user asks why agents keep making mistakes in a repo, how to make a repo agent-ready, or to review an AGENTS.md, CLAUDE.md or agent setup.
argument-hint: "[path of the repository, default: current]"
disable-model-invocation: false
license: MIT
metadata:
  group: harness
  version: "1.0"
---

# Audit the harness

An agent's results depend on the model and on everything around it: what it is told, what it can find, what stops it, and what tells it that it is wrong. This skill inspects that surrounding system and says what to fix first.

The audit reads; it changes nothing.

## Steps

### 1. Collect the evidence

Read the checklist in [`resources/checklist.md`](resources/checklist.md). For each item, look at the repository and record one of:

- **Yes**, with the path that shows it.
- **Partly**, with what is missing.
- **No**.
- **Not applicable**, with the reason.

Verify, do not assume: if `AGENTS.md` names a test command, check that the script exists. If it links to a doc, check that the file is there. Run read-only commands only. If the project has the harness CLI, run `node .agents/harness/cli.mjs check` and use its findings.

For a large repository, delegate the collection per checklist section to read-only subagents in one parallel batch, and ask each for findings with paths.

### 2. Look for the failure history

The best evidence of a gap is a mistake that already happened. Look for:

- Repeated corrections: the same instruction given more than once in `AGENTS.md`, review comments, or commit messages such as "fix lint again" or "revert".
- Instructions in capitals or marked "IMPORTANT": each one marks a rule the agent kept breaking, and a candidate for an automated check.
- Ask the user: "What do agents get wrong most often here?" Their answer outranks the checklist.

### 3. Rank the gaps

Order by payoff, not by checklist order:

1. **No way to verify.** If the agent cannot run one command that says whether the work is right, nothing else matters much.
2. **Unsafe by default.** Secrets readable, destructive commands unguarded.
3. **Missing map.** No `AGENTS.md`, or one that is stale, wrong or too long to be read.
4. **Rules that depend on memory.** Conventions in prose that a check could enforce.
5. **Everything else.**

### 4. Report

```markdown
## Harness audit: <repository>

**Summary**: <two sentences: the state, and the one thing to fix first.>

### Fix first
1. <Gap>. Evidence: <path or observation>. Fix: <the concrete change>. Effort: <S | M | L>.

### Then
...

### Already good
- <What works, with the path. Keep it short.>

### Scorecard
| Area | Yes | Partly | No |
| --- | --- | --- | --- |
```

Every gap has evidence and a concrete fix. "Improve the documentation" is not a finding. "`AGENTS.md:12` names `npm run prep`, which does not exist in `package.json`: replace it with `npm run check`" is.

### 5. Offer the next step

Offer to fix the first gap. If the harness is not installed and the gaps are broad, point to its installer. Do not start without the user's yes.

## Boundaries

- Do not read secret files to check whether they are protected. Check the protection (ignore rules, hook policy, permission settings), not the secret.
- Do not score for the sake of scoring. A small repository with one good verification command and a ten-line `AGENTS.md` can be in excellent shape.
