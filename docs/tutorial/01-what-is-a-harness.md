# 1. What a harness is

## Agent = model + harness

A language model produces text. It becomes a coding agent when something runs it in a loop, hands it tools, feeds the results back, and decides when to stop. That something is the harness.

There are two layers of it:

- The **inner harness** is the product you installed: Claude Code, Cursor, Copilot, Codex. It owns the loop, the tools, the permission prompts, the context window. Its vendor builds it.
- The **outer harness** is everything you add for your project: instructions, documentation, skills, hooks, checks, workflow. You build it. It lives in your repository and is versioned with your code.

This tutorial is about the outer harness. The inner one gives you extension points (instruction files, skills, hooks, subagents), and the craft is in what you put there.

## Why it matters more than the prompt

When an agent gets something wrong, the reflex is to fix the prompt: explain again, add "IMPORTANT", try once more. That fixes one conversation. The same mistake returns tomorrow, in a colleague's session, in a different agent.

A harness fix is durable. A convention written down is read by every future session. A lint rule catches the mistake every time, in every agent, without anyone remembering it. So the working habit of harness engineering is one question, asked after every agent mistake:

> What would have prevented this, or caught it sooner?

and then one change to the harness, so that this mistake cannot happen quietly again.

## The two halves: guides and sensors

Everything in a harness does one of two jobs.

A **guide** acts before the agent works. It raises the chance that the first attempt is right: an instruction file, a convention doc, a skill, a plan template.

A **sensor** acts after the agent works. It notices that something is wrong and says so: a failing test, a lint error, a hook that blocks a command, a reviewer.

A harness with only guides has an agent that is well informed and unchecked: you find the mistakes yourself, in review. A harness with only sensors has an agent that learns each rule by breaking it. You need both.

## The second axis: computed and inferred

Each guide or sensor is one of two kinds.

- **Computed**: a program decides. A type checker, a linter, a test, a regular expression in a hook. Fast, exact, the same every time, and it costs no context.
- **Inferred**: a model decides. An instruction the agent must interpret, a review by another agent. Flexible, but slow, costly, and sometimes wrong.

Put the two axes together and you get the map of a harness. The right-hand column shows where each cell lives in this repository.

| | Computed | Inferred |
| --- | --- | --- |
| **Guide** (before) | Scaffolds, templates, generated config. `harness new-skill`, `harness sync` | Instructions, conventions, skills. `AGENTS.md`, `docs/conventions/`, `.agents/skills/` |
| **Sensor** (after) | Guard policy, lint, tests, the stop gate. `lib/policy.mjs`, `harness check`, `hooks/stop-gate.mjs` | Review with a fresh context. The `fresh-review` skill and the `reviewer` subagent |

The rule that follows from this table is the most useful one in the tutorial:

> **Compute everything that can be computed.** Spend inference only on what needs judgment.

An instruction such as "never commit with `--no-verify`" is an inferred guide. The agent has to notice it, remember it at the right moment, and decide that it applies. A hook that blocks the command is a computed sensor. It cannot be forgotten. When a rule can be checked by a machine, prose is the wrong place for it.

## What goes wrong, and which part fixes it

| Symptom | Missing part | Chapter |
| --- | --- | --- |
| The agent does not know the commands, the layout, the conventions. | A map: `AGENTS.md` and docs it can find. | 3 |
| It knows the rule and breaks it anyway. | A computed sensor instead of prose. | 5, 6 |
| It does the same multi-step task differently every time. | A skill. | 4 |
| It builds the wrong thing, confidently, for an hour. | A workflow with a human check before the code. | 4 |
| It reads a secret, or deletes something. | A guard. | 5 |
| It says "done" and the tests fail. | A stop gate. | 6 |
| It reviews its own work and finds it excellent. | A reviewer with a fresh context. | 6 |
| It gets worse as the session gets longer. | Context discipline: subagents, files, handoffs. | 7 |
| It behaves differently in Cursor than in Claude Code. | One source, generated per agent. | 8 |
| The harness itself rots. | Lint, tests and evals for the harness. | 9 |

## Seven principles

These are the ideas the rest of the tutorial applies.

1. **A map, not a manual.** The always-loaded instruction file is short and points to detail. A file that tries to say everything is too long to be followed.
2. **The repository is the system of record.** If a decision lives only in a chat thread or someone's head, the agent cannot see it, so for the agent it does not exist.
3. **Compute what can be computed.** See above.
4. **Messages are instructions.** An error message is read by a model in the middle of a task. Write it as the prompt it is: what is wrong, why, what to do instead.
5. **Put people where leverage is highest.** A wrong line in a plan becomes hundreds of wrong lines of code. Review research and plans carefully, and let checks carry more of the code review.
6. **Context is a budget.** Everything loaded competes for the model's attention. Load little by default and more on demand.
7. **The harness is software.** It has tests, evals and CI, and it is pruned. Each part encodes an assumption about what the model cannot do alone, and those assumptions expire as models improve.

## Where these ideas come from

The term and its practice were shaped in public over 2025 and 2026. If you want the sources:

- OpenAI, "Harness engineering" (2026): a team building a product with agents writing nearly all the code, and the lessons on maps, mechanical enforcement and repository-local knowledge. <https://openai.com/index/harness-engineering/>
- Birgitta Böckeler on martinfowler.com: the framing of guides and sensors, computational and inferential. <https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html>
- Anthropic, "Effective context engineering for AI agents" and "Effective harnesses for long-running agents": context as a finite resource, progressive disclosure, and handing work across sessions through files. <https://www.anthropic.com/engineering>
- HumanLayer, "Advanced context engineering for coding agents": the research, plan, implement workflow and deliberate compaction. <https://github.com/humanlayer/advanced-context-engineering-for-coding-agents>
- The Agent Skills specification: <https://agentskills.io/specification>. The `AGENTS.md` convention: <https://agents.md>.
- CodelyTV/agent-harness, the repository this one started from: <https://github.com/CodelyTV/agent-harness>

Next: [the anatomy of this harness](02-anatomy.md).
