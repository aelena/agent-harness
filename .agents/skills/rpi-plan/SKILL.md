---
name: rpi-plan
description: Turn a task into a phased implementation plan of vertical slices with public contracts and a test strategy, approved by the user and stored as a plan file, GitHub issues or GitLab issues.
argument-hint: "<task | research file | issue url>"
disable-model-invocation: true
license: MIT
metadata:
  group: workflow
  version: "1.0"
---

# Create a plan

A plan is the smallest document that lets a reviewer catch a wrong design before any code exists, and lets a fresh session implement one phase without this conversation. Read [`resources/plan-format.md`](resources/plan-format.md) before you propose anything.

> [!IMPORTANT]
> Create nothing (no file, no issue) until the user has approved the phases and the contracts.

## Input

`$ARGUMENTS` decides where the plan is stored:

| Input | Store | Also read |
| --- | --- | --- |
| A task in words, or a `research.md` path | A plan file | — |
| A GitHub issue URL | GitHub issues | [`resources/store-github.md`](resources/store-github.md) |
| A GitLab issue URL | GitLab issues | [`resources/store-gitlab.md`](resources/store-gitlab.md) |

If it is empty, ask for the task.

## Steps

### 1. Get the picture of the code

- If a `research.md` exists for this task, read it. If its `commit` is behind `HEAD`, tell the user it may be stale.
- If there is none and the task touches code you have not seen, stop and offer `/rpi-research <task>`. For a small, local task, explore directly: delegate to read-only subagents (four at most, in one parallel batch, cheaper model) and ask each for file paths, existing contracts and conventions, not file dumps.
- Read `AGENTS.md` and the docs it names for this area. Name those docs in the plan's context.

### 2. Decide the phases

Split the task into vertical slices following the phase rules in the format file. Offer the user two or three granularities (for example 1, 3 and 5 phases) with what each phase would deliver, and recommend one. Use the tool for asking the user a question if you have one.

### 3. Define the contracts and the tests

For each phase, write the public contracts it creates, changes or removes, and its test strategy, as the format file describes. If the user did not specify a contract, propose one.

### 4. Propose, then wait

Show the complete plan in the conversation. Ask for approval or changes. Repeat until the user approves.

### 5. Store the plan

- **File**: write `.agents/plans/<YYYY-MM-DD>-<task-slug>/plan.md`. Use the folder of the research file when there is one.
- **GitHub or GitLab**: follow the store file.

### 6. Stop

Report where the plan is and offer the next steps without taking them:

- Commit the plan (`docs:` type), with the `git-commit` skill if it is installed.
- Implement the first phase: `/rpi-implement <plan path or issue url>`.

One run of `rpi-implement` implements one phase. If the user says "commit and implement", commit the plan and implement Phase 1 only.

## Boundaries

- Write the plan in English, whatever the language of the conversation.
- A plan changes no code.
