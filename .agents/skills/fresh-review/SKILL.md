---
name: fresh-review
description: Get an independent review of the current changes from a subagent that has not seen this conversation, checked against the plan or the stated intent. Use when a phase or a change is finished and before committing it, or when the user asks for a second opinion on a diff.
argument-hint: "[plan path | what the change is meant to do]"
disable-model-invocation: false
license: MIT
metadata:
  group: workflow
  version: "1.0"
---

# Review with fresh eyes

The session that wrote a change is a poor judge of it: it remembers what the code is meant to do and reads that into the diff. A reviewer that starts from nothing but the diff and the intent sees what is actually there. This skill sets up that reviewer and then verifies what it finds.

## Steps

### 1. Gather the inputs

- **The change**: `git diff HEAD` plus untracked files (`git status --porcelain`). If there is no change, say so and stop.
- **The intent**: `$ARGUMENTS`. If it is a plan path, use the plan's Goal, Decisions and the phase that was just implemented. If it is empty, look for an in-progress plan under `.agents/plans/`; failing that, state the intent in two sentences from the conversation and tell the user that this is what the review is measured against.
- **The rules**: the docs that `AGENTS.md` names for the files in the diff.

### 2. Brief the reviewer

Start one subagent. Use the project's `reviewer` subagent if there is one; otherwise a general one restricted to reading. Give it exactly what [`resources/review-brief.md`](resources/review-brief.md) contains, filled in.

Give it the intent and the diff. Do not give it your reasoning, your own assessment, or the list of things you think are fine: a reviewer that is handed a conclusion returns it.

### 3. Verify every finding yourself

A finding is a claim, not a fact. For each one, open the cited lines and decide:

- **Confirmed**: you can state the input or state that makes it fail.
- **Rejected**: say why in one line (the caller already guards it, the cited code does not do that).
- **Unclear**: needs the user's judgment.

Drop nothing silently. Rejected findings are reported too, with the reason.

### 4. Report and stop

Report, most severe first:

```
Confirmed
1. <file>:<line>  <defect in one sentence>
   Fails when: <concrete input or state>

Needs your call
2. ...

Rejected
3. <claim>: <why it does not hold>
```

End with the reviewer's verdict on the intent: does the change do what it was meant to do, and what is missing.

Do not fix anything yet. Ask which confirmed findings to fix. When the user answers, fix those, run the verification command, and report.

## Boundaries

- The reviewer reads; it does not edit.
- One review round per run. If the fixes are substantial, run the skill again for a new reviewer rather than reusing the old one, which now shares your blind spots.
