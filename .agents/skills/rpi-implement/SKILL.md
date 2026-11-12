---
name: rpi-implement
description: Implement exactly one phase of an approved plan (a plan file, or a GitHub or GitLab plan issue), verify it, record progress in the plan, and stop for review without committing.
argument-hint: "<plan path | issue url>"
disable-model-invocation: true
license: MIT
metadata:
  group: workflow
  version: "1.0"
---

# Implement one phase

> [!IMPORTANT]
> One phase per run. When the phase is verified, stop. The next phase starts only when the user runs this skill again.

> [!IMPORTANT]
> Do not commit, push or merge on your own. Suggest; the user decides.

The plan is the whole brief. This skill is meant to run in a fresh session that has read nothing but the plan, so if the plan is not enough to implement the phase, that is a defect in the plan: say so instead of guessing.

## Input

`$ARGUMENTS` is a plan file path, or a GitHub or GitLab issue URL (the parent plan issue or one phase issue). If it is empty, ask for it.

- For a GitHub issue URL, read [`resources/store-github.md`](resources/store-github.md) now and follow it where it differs from the steps below.
- For a GitLab issue URL, read [`resources/store-gitlab.md`](resources/store-gitlab.md) likewise.

## Steps

### 1. Find the current phase

The current phase is the first phase with an unchecked task (`- [ ]`). If every task is checked, say that the plan is complete and stop.

### 2. Load only what the phase needs

Read the plan's Goal, Decisions and the current phase. Open the files the phase's tasks name, and the docs the plan's Context lists. Do not read other phases' files "for context".

### 3. Implement the tasks, in order

- Write the tests the phase lists along with the code, not after it.
- Check each box in the plan as soon as its task is done, so an interrupted session can be resumed from the plan alone.
- Stay inside the phase. If you find that the phase needs something the plan does not cover, stop and report it. Do not widen the phase silently.

### 4. Verify

Run the project's verification command (find it in `AGENTS.md`). Read the failures, fix their cause, and run it again until it passes. Never weaken or delete a test, and never bypass a check, to make it pass. If you cannot make it pass, stop and report what fails and what you tried.

Then exercise the behaviour itself once (run the command, call the endpoint, open the page) when the project allows it. Passing tests show the tests pass; they do not show the feature works.

### 5. Record progress

In the plan file:

- Check the phase's remaining boxes, including the verification task.
- Rewrite `Next step` to name the next phase, or to say the plan is complete.
- Add or update in the frontmatter, leaving every other field as it is:

  ```yaml
  status: "in-progress"   # or "complete" after the last phase
  last_implemented_at: "<YYYY-MM-DDTHH:MM:SSZ>"
  implemented_by:
    tool: "<e.g. Claude Code>"
    model: "<name and version>"
  ```

### 6. Stop and report

Report in this order:

1. What the phase delivered, in two or three sentences.
2. The verification result: the command and its outcome. If you could not exercise the behaviour, say so.
3. Anything that deviated from the plan, and why.
4. Three commit message options with different plausible Conventional Commit types, numbered so the user can answer "commit with 2".

Then offer the next steps without taking them: an independent review (`/fresh-review`), the commit, and the next phase.

## Boundaries

- Touch only files the current phase needs.
- A phase that is implemented but not verified is not done. Leave its verification box unchecked and say why.
