# Skill frontmatter

## Rule

Every `SKILL.md` starts with this frontmatter. `name` equals the folder name. `description` says what the skill does and, when the model may invoke it, when to use it. `disable-model-invocation` is always written out.

```yaml
---
name: git-commit
description: Create one git commit with a Conventional Commits message. Use when the user asks to commit.
argument-hint: "[commit message]"
disable-model-invocation: false
license: MIT
metadata:
  group: git
  version: "1.0"
---
```

- `disable-model-invocation: true` for a skill with side effects that only the user should start: planning, implementing, opening pull requests, writing specs.
- `metadata.group` places the skill in the README table and in `skills.sh.json`. Group titles are set in `.agents/harness.json`.
- `metadata.version` is a quoted string. Raise it when the skill's behaviour changes.
- Anything not in the Agent Skills specification or the Claude Code extensions goes under `metadata`.

## Why

- The description is the only part of a skill that is loaded into every session. It is all the model has when it decides whether to open the skill, so a description without a trigger leaves that decision to chance.
- Agents find a skill by its folder. A `name` that differs from the folder gives a skill that is listed under one name and invoked under another.
- An explicit invocation flag makes "can the model start this by itself?" a decision someone took, not a default nobody noticed.

## Examples

### Good: says what and when

```yaml
description: Write a handoff note that lets a fresh session continue this work. Use when the conversation is getting long, before clearing context, or when stopping for the day.
```

### Bad: could describe three different skills

```yaml
description: Create a plan for the specified task.
```

Upstream shipped two skills with exactly this description. The model cannot choose between them.

## Enforcement

`harness check`: `skill/name`, `skill/description`, `skill/trigger`, `skill/duplicate-description`, `skill/invocation`, `skill/group`, `skill/version`, and `skill/unknown-field` as a warning. `evals/triggers.jsonl` must hold two positive cases and one near-miss for every skill the model may invoke (`evals/trigger-coverage`).

## See also

- [`.agents/skills/session-handoff/SKILL.md`](../../../.agents/skills/session-handoff/SKILL.md)
- [Self-contained skills](self-contained.md)
