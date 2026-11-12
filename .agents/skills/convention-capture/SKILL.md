---
name: convention-capture
description: Turn a correction the user just made, or a convention they describe, into a permanent part of the harness - an automated check when the rule can be tested by a machine, a convention doc otherwise. Use when the user corrects the same kind of mistake a second time, says "we always" or "we never" do something, or asks to document a convention.
argument-hint: "[the convention, in words]"
disable-model-invocation: false
license: MIT
metadata:
  group: harness
  version: "1.0"
---

# Capture a convention

When an agent makes a mistake, the fix that lasts is a change to the harness, not a better prompt next time. This skill makes that change.

A rule can live in two places:

- **A check** (lint rule, test, type, hook, CI step). It is enforced every time, costs no context, and its failure message teaches the fix at the moment it is needed.
- **A doc**. It is read only when an agent decides to read it, and followed only when the agent judges that it applies.

Prefer the check. Write the doc when no machine can decide the rule, and to explain the reason behind a check.

## Steps

### 1. Extract the convention

From `$ARGUMENTS`, or from the corrections in this conversation, state:

- **The rule**, in one sentence that a reader could apply without you.
- **Why**: the problem it prevents. If you do not know, ask. A rule without a reason is dropped the first time it is inconvenient.
- **A good example**: the corrected version.
- **A bad example**: what was written first.
- **Real cases**: files in the repository that already follow it.
- **Exceptions**: where it does not apply.

Ask the user only about what the conversation leaves unclear. Put all your questions in one message.

### 2. Decide how it is enforced

Go down this list and stop at the first that fits:

1. **An existing tool can express it** (a lint rule, a compiler option, a formatter setting, a dependency rule): turn it on.
2. **It is a structural fact about files** (naming, location, a required section, a forbidden import): write a small check and add it to the project's verification command.
3. **It is behaviour**: write a test that fails when the rule is broken.
4. **It is a dangerous action**: add a rule to the guard policy (`policy.custom` or `policy.protectedPaths` in `.agents/harness.json`), with a reason that tells the agent what to do instead.
5. **Only judgment can decide it** (naming quality, what is worth abstracting, tone): write the doc alone.

Tell the user which one you chose and why, in two sentences, before you build it. Building a check changes the project's tooling, so wait for their yes.

### 3. Build it

- **The check**, if there is one. Write its failure message as an instruction: what is wrong, why, and how to fix it. Prove that it works: show it failing on the bad example and passing on the good one.
- **The doc**, following [`resources/convention-format.md`](resources/convention-format.md). Look at the folders under `docs/conventions/` (or wherever `AGENTS.md` says conventions live) and put it in the one that fits; create a folder only if none does. Its `Enforcement` section names the check, or says that there is none.

### 4. Make it findable

A doc that the map does not mention is never read.

- If the project has the harness CLI, run `node .agents/harness/cli.mjs sync` to regenerate the docs map in `AGENTS.md`, then `node .agents/harness/cli.mjs check`.
- Otherwise add one line for the new doc to the docs list in `AGENTS.md` by hand.

Do not paste the rule itself into `AGENTS.md`. It holds the map, not the territory.

### 5. Report

Say what was created (paths), how the rule is enforced, and what to commit. Do not commit.

## Boundaries

- One convention per run. Two rules are two docs.
- Do not rewrite existing code to follow the new convention unless the user asks. Offer it as a follow-up.
