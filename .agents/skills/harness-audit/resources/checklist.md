# Harness checklist

A harness has two halves. **Guides** act before the agent works and raise the chance that it is right the first time. **Sensors** act after and tell it when it is wrong. Each can be **computed** (a program decides: fast, exact, free) or **inferred** (a model decides: flexible, slow, sometimes wrong). A sound harness has both halves, and computes whatever can be computed.

## 1. Instructions (guide)

- [ ] A root `AGENTS.md` exists, and every agent in use reads it (directly, or through an import such as a `CLAUDE.md` containing `@AGENTS.md`).
- [ ] It is short enough to be read every session: about 100 lines or fewer.
- [ ] It gives the exact commands to install, run, test and verify, and they work.
- [ ] It is a map: it points to deeper docs instead of containing them.
- [ ] Nothing in it is stale: every path and command it names exists.
- [ ] Large or distinct areas have their own nested `AGENTS.md`.
- [ ] It contains no secrets and no personal preferences that belong in user-level settings.

## 2. Knowledge (guide)

- [ ] Conventions live in versioned files in the repository, not in chat history, wikis or people's heads.
- [ ] Each convention has a rule, a reason and an example, and stands alone.
- [ ] Architecture decisions are recorded where an agent will find them.
- [ ] Docs are checked mechanically for broken links and required structure.
- [ ] There is a way to add a convention when an agent is corrected, and it is used.

## 3. Skills and workflow (guide)

- [ ] Repeated multi-step tasks (planning, committing, releasing, reviewing) are skills, not prompts retyped each time.
- [ ] Each skill's description says when to use it, so the model can decide.
- [ ] Skills with side effects can only be started by the user.
- [ ] Skills keep detail in resource files read on demand.
- [ ] Non-trivial work goes through research, plan, implement, with a human review where the plan is approved.
- [ ] Work is cut into phases that can each be reviewed and verified alone.

## 4. Guardrails (computed sensor, before the action)

- [ ] Secret files cannot be read by the agent: by hook, permission rule or sandbox.
- [ ] Dumping the environment is blocked, or secrets are not in the agent's environment at all.
- [ ] Destructive commands (recursive delete of broad paths, force-push, hard reset) are blocked or need confirmation.
- [ ] Bypassing checks (`--no-verify`) is blocked.
- [ ] The agent cannot silently change its own guardrails.
- [ ] Block messages tell the agent what to do instead.
- [ ] The same policy applies in every agent the team uses.

## 5. Feedback loops (computed sensor, after the action)

- [ ] One command verifies the work: types, lint, tests. `AGENTS.md` names it.
- [ ] It is fast enough to run after every phase: a few minutes at most.
- [ ] Its output is readable by an agent: failures are specific, and success is quiet.
- [ ] Formatting and lint errors reach the agent right after an edit, not at the end.
- [ ] The agent cannot declare the work done while verification fails.
- [ ] Architecture rules (layering, allowed dependencies, naming) are enforced by tools, not by prose.
- [ ] Custom lint messages explain the fix.
- [ ] CI runs the same verification, so a local pass means something.

## 6. Review (inferred sensor)

- [ ] Changes are reviewed by something that did not write them: a human, or an agent with a fresh context.
- [ ] The reviewer is given the intent to check against (plan, spec, issue), not only the diff.
- [ ] Findings are verified before they are acted on.

## 7. Context

- [ ] Exploration is delegated to subagents, so that the main context holds conclusions and not file dumps.
- [ ] Long work can be handed to a fresh session through a written note or the plan itself.
- [ ] Plans and research are files, not chat messages.
- [ ] Always-loaded text (instructions, skill descriptions, tool definitions) is kept small on purpose.

## 8. Maintenance

- [ ] The harness itself is linted and tested, in CI.
- [ ] Generated configuration is generated from one source, and drift is detected.
- [ ] There are evals: recorded cases that show the guardrails and the skills still behave as intended.
- [ ] Rules are removed when they stop being needed. Every instruction costs attention.
- [ ] Someone owns the harness, and agent mistakes are routinely turned into changes to it.
