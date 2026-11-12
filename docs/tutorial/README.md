# Build your own agent harness

A coding agent is a model plus everything around it. You do not control the model. You control the rest: what the agent is told, what it can find, what stops it, and what tells it that it is wrong. That rest is the **harness**, and building it well is most of the difference between an agent that helps and one that needs watching.

This tutorial explains how a harness works and walks you through building one, using this repository as the worked example. Every technique shown here exists as running, tested code in the repo, and each chapter points to it.

## Who this is for

You use a coding agent (Claude Code, Cursor, Copilot, Codex or another) on a real codebase, and you have noticed that it repeats the same mistakes, forgets conventions, or declares work finished when it is not. You can read JavaScript and edit JSON. No other background is assumed.

## The chapters

| # | Chapter | You will be able to |
| --- | --- | --- |
| 1 | [What a harness is](01-what-is-a-harness.md) | Name the parts of a harness and say which kind of part fixes which kind of failure. |
| 2 | [Anatomy of this harness](02-anatomy.md) | Find your way around this repository and follow one tool call through it. |
| 3 | [Instructions and knowledge](03-instructions-and-knowledge.md) | Write an `AGENTS.md` that is a map, and turn corrections into conventions. |
| 4 | [Skills and workflow](04-skills-and-workflow.md) | Write a skill that triggers reliably, and run work as research, plan, implement. |
| 5 | [Guardrails](05-guardrails.md) | Write a guard hook, then replace it with a policy that judges structure. |
| 6 | [Feedback loops](06-feedback-loops.md) | Give the agent fast feedback after edits and stop it from finishing on red. |
| 7 | [Context](07-context.md) | Keep the context small with subagents, files and handoffs. |
| 8 | [Portability](08-portability.md) | Run one harness in six agents, and add a seventh. |
| 9 | [Keeping it honest](09-keeping-it-honest.md) | Lint, test and evaluate the harness itself, and prune it. |
| 10 | [Adopt it](10-adopt.md) | Install this harness in your repository and grow it in the right order. |

## Three ways to read it

- **Twenty minutes.** Read chapter 1, then run the install in chapter 10 on a repository of yours, and try `cat .env` through your agent.
- **Build along.** Chapters 3 to 6 each end with an exercise. Do them in a scratch repository. You will end with a small harness you understand completely.
- **Reference.** Chapter 8 holds the per-agent tables. Chapter 9 lists every lint rule.

## Conventions used here

- Commands are run from the repository root. `harness` is short for `node .agents/harness/cli.mjs`.
- "The agent" means whichever coding agent you use. Where agents differ, the text says so.
- Paths in `code font` are real. Open them as you read.
