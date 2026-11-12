---
name: openspec-baseline
description: Write OpenSpec specs for behaviour that already exists in the code, from evidence in contracts, implementation and tests, so that later changes can modify or remove it instead of only adding to it.
argument-hint: "[capability | upcoming change | path]"
disable-model-invocation: true
license: MIT
compatibility: Requires the OpenSpec CLI (openspec) and an openspec/ folder in the project.
metadata:
  group: specs
  version: "1.0"
---

# Write the baseline spec of existing behaviour

An OpenSpec change can only modify or remove a requirement that already exists under `openspec/specs/`. Behaviour built before the project adopted OpenSpec has no spec, so every change to it lands as an addition and the spec never learns what was there. This skill writes that missing baseline.

The baseline is what would have been archived had the feature been built with OpenSpec: **behaviour that was intended and is verified**. A baseline that flatters the code is worse than none, because the next proposal builds on it.

## Input

Read `$ARGUMENTS` as one of:

| Input | Example | Scope |
| --- | --- | --- |
| Nothing, or a question about coverage | `what has no spec?` | Build the inventory in [`resources/evidence.md`](resources/evidence.md#inventory) and stop until the user picks a row. |
| A capability | `checkout` | That capability. |
| A change about to be made | `add coupons to checkout` | The current behaviour the change will touch. The new behaviour belongs to the change, not here. |
| A path or a screen | `src/app/admin/orders` | The business concept that path serves. |

## Steps

### 1. Check the preconditions

- Run `openspec --version`. If the CLI is missing, stop and ask the user to install it.
- Find the OpenSpec root: the `openspec/` folder that holds `config.yaml`.
- Read `context:` in `config.yaml` for the language of the specs. Default to English.

### 2. Bound the capability

- A capability is one folder under `openspec/specs/`, named in kebab-case after a business concept (`checkout`, `order-management`), never after a class, a table or a folder.
- Run `openspec list --specs`. If a spec already covers part of the behaviour, extend it.
- If the areas involved share no business concept, they are several capabilities: propose the split.
- Run `openspec list`. If an active change has a delta on this capability, warn the user that extending the main spec can break that change's archive, and ask whether to continue.

Done when the user has confirmed each capability and whether it is new or extended.

### 3. Collect the evidence

Read [`resources/evidence.md`](resources/evidence.md) and start the subagents it describes. Your job is to cross their reports, not to read the codebase.

Done when every candidate behaviour carries its evidence.

### 4. Classify

Put every candidate into one of the four cases in [`resources/evidence.md`](resources/evidence.md#the-four-cases). Ask the user about all ambiguous candidates in a single round.

### 5. Write the specs

Read [`resources/spec-format.md`](resources/spec-format.md) and write `openspec/specs/<capability>/spec.md` with the intended and verified behaviour only.

When extending a spec, add to it and leave every existing requirement exactly as it is. An existing requirement that the code contradicts is **drift**: report it. Changing it is the job of an OpenSpec change.

### 6. Validate

Run `openspec validate <capability> --type spec --strict` for each spec. Fix every error and warning and run it again until it passes.

### 7. Report and stop

In the user's language, in this order:

1. The specs written or extended.
2. Scope decisions: splits, extensions, what was left out of scope and why.
3. Candidates left out of the spec, each with its case and evidence.
4. Drift between existing requirements and the code.

Do not paraphrase the specs: the files are the deliverable. Then close with what applies:

- Always: "Review `<spec paths>`. They come from the code, and from now on agents will treat them as the truth."
- If the input was an upcoming change: the command to continue it, `/openspec-explore <the change as the user described it>`.
- For each bug left out: a ready-to-paste line, `/openspec-explore <the behaviour the intent asks for> fails when <the case that breaks> (<path:line>)`.

## Boundaries

- Write only under `openspec/specs/`. Leave changes, `config.yaml` and the code as they are.
- Leave the specs uncommitted until the user has reviewed them.
