# 7. Context

The context window is the agent's working memory, and it behaves like a budget. Everything loaded into it (instructions, file contents, command output, the conversation so far) competes for the model's attention. As it fills, early details blur and quality drops, well before any hard limit is reached. A harness manages that budget on purpose.

There are four tools for it: load less by default, delegate reading to subagents, keep state in files, and hand off to a fresh session.

## Load less by default

Some text is in the context of every session before the user types a word:

- `AGENTS.md`
- the `name` and `description` of every installed skill
- the description of every subagent and every tool
- whatever the session-start hook prints

This is the fixed cost of your harness, paid on every task. Keep it small and make growth visible:

| Always-loaded text | Budget here | Enforced by |
| --- | --- | --- |
| `AGENTS.md` | 120 lines | `docs/agents-md-size` |
| A skill description | 1,024 characters | `skill/description` |
| A skill body (loaded on use) | 300 lines | `skill/size` |
| Session-start output | A few lines, nothing when there is nothing to say | By design, tested |

The pattern is the one from [chapter 4](04-skills-and-workflow.md): a short index that is always present, and detail that is loaded when a task needs it. Conventions follow it (the map lists them, the agent opens the one it needs). Skills follow it (description, then body, then resources).

Also mind what tools return. A test run that prints three hundred passing lines, or a command that dumps a whole file, spends context on nothing. Prefer quiet reporters and commands that return the relevant part.

## Subagents: a firewall for context

Exploring a codebase is expensive in context: to learn one fact you read ten files, and all ten stay in the window. A **subagent** solves this. It is a separate agent with its own context, started by the main one with a written brief. It reads the ten files, and returns one paragraph. The main context receives the conclusion and never the files.

This harness defines two, in `.agents/agents/`:

| Subagent | Tools | Model | For |
| --- | --- | --- | --- |
| [`explorer`](../../.agents/agents/explorer.md) | Read, Glob, Grep | A small, fast one | Answering "where is X" and "how does Y work" with `path:line` citations. |
| [`reviewer`](../../.agents/agents/reviewer.md) | Read, Glob, Grep | Same as the session | Checking a change against its intent, with no knowledge of how it was written. |

Three design choices are worth copying.

**Least privilege.** Both are read-only. An explorer that cannot edit cannot "helpfully" fix something on the way. The linter warns when a subagent has no `tools` list, because it would then inherit every tool.

**A cheaper model for reading.** Finding files and reporting facts does not need the strongest model. The skills ask for a lighter one where the agent allows the choice, and run several explorers in parallel in one batch.

**A report contract.** A subagent's output is written into the main context, so its format matters as much as a function's return type. Both definitions spell out what to return: answers with citations, entry points, conventions, surprises, and what could not be answered. "No file dumps" is part of the contract.

### Briefing a subagent

A subagent starts with none of the conversation. The brief is everything it knows. A good brief has:

- the goal, and what it is in service of;
- the specific questions;
- the area to search;
- what is already known or ruled out;
- the format of the answer.

A subagent is also a source of error you cannot see into. Its mistakes arrive in the same confident tone as its findings. Two rules follow, and the skills apply both:

- **Verify what matters.** `rpi-research` opens the cited lines when two reports disagree. `fresh-review` checks every finding before reporting it.
- **Do not hand over your conclusion.** A reviewer told "I think this is fine, please confirm" confirms. Give it the evidence and let it conclude.

Subagents are not free. Each one spends tokens, and each handoff loses detail in both directions. Use one when the reading is broad or when independence is the point (review). For a lookup whose location you already know, read the file.

## Files are the memory

A conversation is a poor place to keep state. It is linear, it gets summarized, and it ends. A file is durable, reviewable, and can be read by a session that was not there.

So this harness puts every piece of state that must outlive a step into a file:

| State | File | Written by | Read by |
| --- | --- | --- | --- |
| How the code works | `.agents/plans/<task>/research.md` | `rpi-research` | `rpi-plan` |
| What to build, and progress | `.agents/plans/<task>/plan.md` | `rpi-plan`, `rpi-implement` | `rpi-implement`, the session-start hook, you |
| Where the session stopped | `.agents/handoff.md` | `session-handoff` | The next session |
| What the team decided | `docs/conventions/` | `convention-capture` | Every session |

The plan is the best example. Its checkboxes are the progress state. `rpi-implement` checks each box as a task completes, so a session that dies mid-phase loses nothing: the next one reads the plan and continues from the first unchecked box.

## Hand off instead of compacting

Long sessions degrade. When the window fills, the agent's harness compacts it automatically: it replaces the history with a summary. That summary keeps what was said, weighted by nothing in particular. The detail you needed (the constraint the user mentioned once, the approach that already failed) is as likely to go as anything else.

The alternative is a deliberate handoff: write down what matters, then start a fresh session with only that. The `session-handoff` skill writes `.agents/handoff.md`:

```markdown
# Handoff: coupon expiry

Written: 2026-11-12 17:40 · Branch: feat/coupons · Last commit: 3f9a2c1

## Goal
Coupons expire at the end of their last valid day, in the shop's timezone.

## State
- Done: expiry check in `CouponValidator` (tests pass).
- In progress: `src/checkout/apply-coupon.ts`, `applyCoupon()`: maps the new error, UI copy not wired.
- Verification: `npm run verify` fails, 1 test (`apply-coupon.test.ts`: expects the old message).

## Decisions
- Expiry uses the shop timezone, not UTC. The user decided this.

## Dead ends
- Comparing dates as strings: breaks across DST. Do not retry.

## Next step
Update the expected message in `apply-coupon.test.ts:48`, then wire the copy in `CouponBanner.tsx`.
```

The skill's rules are what make the note useful: establish facts from `git status` and the plan instead of from memory, name uncommitted work file by file, record dead ends, and give one concrete next step.

The note is picked up automatically. At the start of the next session the hook prints one line:

```text
[harness] The previous session left a handoff note (2026-11-12 17:40 UTC): .agents/handoff.md. Read it before you start.
```

A fresh session with sixty lines of exactly the right context usually does better than a long one with everything.

The workflow in [chapter 4](04-skills-and-workflow.md) is this idea applied on a schedule: research, plan and each phase can each run in a new session, because each starts from a file.

## The session-start hook

[`lib/session.mjs`](../../.agents/harness/lib/session.mjs) decides what a new session is told. It is a good model of restraint:

- It prints **nothing** in a clean repository.
- A plan with unchecked tasks gets one line: path, progress, current phase, and "continue it only if the user asks".
- A handoff note gets one line.
- Stale generated wiring gets one line with the command that fixes it.

Every line here is added to every session, so each has to earn its place.

## Exercise

1. Count your always-loaded text: the lines of your instruction file, plus the descriptions of your installed skills. Is any of it there for one task in ten?
2. Ask your agent a broad question about your codebase twice: once directly, once through a read-only subagent with a written brief. Compare how much of the context each used.
3. In the middle of a real task, run `/session-handoff`, start a fresh session, and continue. Note what the new session got wrong: that is what the note was missing.

Next: [portability](08-portability.md).
