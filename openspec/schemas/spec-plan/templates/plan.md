---
name: "<!-- change name -->"
description: "<!-- one sentence -->"
created_at: "<!-- YYYY-MM-DDTHH:MM:SSZ -->"
created_by:
  tool: "<!-- e.g. Claude Code -->"
  model: "<!-- name and version -->"
---

# <!-- Plan title -->

## Goal

<!-- 1-3 sentences: what gets built and why it matters -->

## Decisions

- <!-- choice or assumption (instead of <discarded alternative>, when not obvious) -->
- Out of scope: <!-- what this change does not do -->

## Phases

### Phase 1: <!-- vertical slice -->

<!-- What this phase delivers -->

**Contracts**

```<!-- project language -->
<!-- Contract type, as a comment -->
<!-- signature -->
```

**Tests**

- `<!-- test suite -->`: <!-- behaviours it covers -->

**Tasks**

- [ ] <!-- task -->
- [ ] Verify types, lint and every test suite with the project's verification command, and exercise the phase's behaviour in the running app. Fix every failure.

## Next step

Run `/openspec-apply-change` to implement the first phase.
