# Plan format

## Template

````markdown
---
name: "<plan name>"
description: "<one sentence>"
created_at: "<YYYY-MM-DDTHH:MM:SSZ>"
created_by:
  tool: "<e.g. Claude Code>"
  model: "<name and version>"
research: "<path to research.md, or none>"
status: "planned"
---

# <Plan title>

## Goal

<One to three sentences: what gets built and why it matters.>

## Context

- [`path/to/file`](../../../path/to/file): <why it matters for this task>
- Conventions that apply: [`docs/...`](../../../docs/...)

## Decisions

- <A choice or assumption the request did not state> (instead of <the alternative you discarded>).
- Out of scope: <what this plan does not do>.

## Phases

### Phase 1: <the slice, named by what a user can do after it>

<Two sentences: what this phase delivers.>

**Contracts**

```<language>
// <contract type>
<public signature>
```

**Tests**

- `<test suite>`: <the behaviours it proves>

**Tasks**

- [ ] <task; name the existing file to copy the pattern from>
- [ ] Verify: run the project's verification command (see AGENTS.md) and fix every failure.
- [ ] Stop: present the changes for review and suggest commit messages. Do not start the next phase.

## Next step

Phase 1: <title>.
````

## Phase rules

- **Vertical slices.** A phase goes through every layer it needs (interface, logic, persistence, tests) for one behaviour. Never split by layer.
  - Wrong: the endpoint in Phase 1 and the service it calls in Phase 2.
  - Right: Phase 1 delivers the happy path of "edit profile" end to end, with its tests. Phase 2 adds validation and its tests.
- **Each phase stands alone.** After any phase the build passes, the tests pass, and the commit makes sense if the next phase never happens.
- **Early feedback first.** Phase 1 produces something the user can run or see, even with placeholder content.
- **One responsibility.** Adding a dependency and the first feature that uses it are two phases if either is non-trivial to review.
- **Every phase ends with the same two tasks**, in this order: the verification task and the stop task from the template.
- **Only tasks are checkboxes.** The implement step finds the current phase by its unchecked boxes, so a `- [ ]` anywhere else breaks it.

## Contracts

List public signatures only, in the language they are written in, grouped by type. Leave out any type with no change.

- API endpoints and their payloads.
- Application services and their method signatures.
- Domain events and their attributes.
- Ports and repositories.
- Database schemas: tables, columns, indexes.
- Text shown to end users, in the UI or in email.

## Test strategy

Prove each behaviour once, at the cheapest level that can prove it.

- One acceptance test per user goal, through the public API or the UI.
- Unit tests of the application service for the rules, with cases chosen by equivalence classes and boundary values.
- Name each suite and the behaviours it covers. Do not list every test case.

## Writing

- Goal: three sentences at most.
- Link every file in Context so the reviewer can open it.
- Decisions carry the reasoning a reviewer most needs. One line each.
- Next step: one sentence naming the phase to implement next.
