---
name: rpi-research
description: Research how the codebase works today for a task or question and save the findings as a cited research file. First step of the research, plan, implement workflow.
argument-hint: "<task or question>"
disable-model-invocation: true
license: MIT
metadata:
  group: workflow
  version: "1.0"
---

# Research the codebase

Produce a short, cited description of how the code works **today** in the area a task will touch. A plan built on a wrong picture of the code fails in every phase, so this step is where a mistake is cheapest to catch.

Research states facts. It does not propose a design, judge the code, or suggest improvements: those belong to the plan.

## Input

`$ARGUMENTS` is a task ("add coupons to checkout"), a question ("how do refunds reach the ledger?"), or an issue URL. If it is empty, ask for it.

## Steps

### 1. Frame the questions

Read `AGENTS.md` and only the docs it points to for this area. Then write 3 to 6 concrete questions the research must answer, for example "Where is the order total computed?" and "Which tests cover it?". Show them to the user in one message and continue unless they object.

### 2. Delegate the exploration

Do not read the codebase yourself: your context is for crossing the reports.

- Start one subagent per independent area (a backend module, a set of screens, a worker, the test suite). One is enough for a small, local task. Four is the maximum.
- Start them in a single batch so they run in parallel.
- Use the project's read-only exploration subagent if there is one (`explorer`), and a cheaper model than your own when the tool lets you choose.
- Give each subagent its questions, its area, and the report contract in [`resources/research-format.md`](resources/research-format.md#report-contract). A subagent starts with none of your context: the brief is all it knows.

Done when every question has an answer with a `path:line` citation, or is marked unanswered.

### 3. Cross the reports

- Open only the specific files you need to settle a contradiction between two reports or to confirm a contract you will quote.
- Where the code and its tests disagree, record both. Do not pick a winner.
- Collect what nobody could answer as open questions for the user.

### 4. Write the file

Write `.agents/plans/<YYYY-MM-DD>-<task-slug>/research.md` in the format of [`resources/research-format.md`](resources/research-format.md). Keep it under 200 lines: the plan step loads all of it.

### 5. Stop

Tell the user where the file is, list the open questions, and stop. Offer the next step without taking it:

```
Review the research, then plan from it: /rpi-plan .agents/plans/<folder>/research.md
```

## Boundaries

- Write only the research file. Change no code.
- Cite or drop: a claim without a `path:line` is a guess, and guesses do not go in the file.
