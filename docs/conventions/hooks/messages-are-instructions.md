# Messages are instructions

## Rule

Every message the harness prints for an agent (a block reason, a lint finding, a failed sensor, a stop-gate reason) says three things: what is wrong, why it matters, and what to do instead. It names the rule that produced it. Success prints nothing.

## Why

- The reader is a model in the middle of a task. The message is the only prompt it gets at the moment it needs one, so it works exactly as well as it is written.
- A refusal with no next step leaves the agent two options: stop, or look for a way around. An alternative gives it a third.
- Output on success costs context on every run and teaches the agent to skim. Silence keeps failures visible.

## Examples

### Good: a block the agent can act on

```text
Blocked by harness policy [secret-file] (.env): This path holds credentials. Do not read, copy or
upload it. Read the example file (such as `.env.example`) for the variable names, or ask the user.
```

In a real session the agent answered this by offering to read `.env.example`.

### Good: a finding that carries the fix

```text
error  .agents/skills/deploy/SKILL.md  [skill/trigger]
       This skill can be invoked by the model, so its description must say when: add a sentence
       starting "Use when ...". Without a trigger the model guesses.
```

### Bad: true and useless

```text
Blocked: the export command is not allowed by security policy
```

```text
Invalid frontmatter.
```

## Enforcement

Partly automated. `tests/policy.test.mjs` asserts that every blocking verdict names its rule, and `tests/harness.test.mjs` rejects findings without an explanation. Whether a message is actually helpful needs judgment in review.

## See also

- [`.agents/harness/lib/policy.mjs`](../../../.agents/harness/lib/policy.mjs): the `RULES` table.
- [Policy rules](policy-rules.md)
