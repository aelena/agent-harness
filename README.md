# agent-harness

A portable, tested harness for coding agents: the instructions, skills, guardrails and feedback loops that turn a capable model into a reliable collaborator, written once and wired into every agent your team uses.

- **One source, six agents.** Skills, rules and one guard policy live under `.agents/`. `harness sync` generates the wiring for Claude Code, Cursor, GitHub Copilot and Codex, and optionally Gemini CLI and OpenCode.
- **A guard that understands commands.** It parses the shell line instead of matching substrings, so it blocks `env`, `cat .env` and `git commit --no-verify`, and lets `npm run export` through. Every block tells the agent what to do instead.
- **Feedback loops.** Fast checks after each edit, and a stop gate: the agent cannot finish while your verification command fails.
- **A workflow.** Research, plan, implement one phase, review with fresh eyes, commit. Each step leaves a file, so the next can start in a clean session.
- **It checks itself.** A linter for skills, docs and generated files, tests that run the real hooks in every agent's format, recorded policy scenarios, CI on three operating systems.
- **Zero dependencies.** Node 20 or newer. Windows, macOS, Linux.

New to the idea? Start with the tutorial: **[Build your own agent harness](docs/tutorial/README.md)**.

## Quick start

Install into your repository, from a clone of this one:

```bash
node .agents/harness/cli.mjs install /path/to/your/repo
cd /path/to/your/repo
node .agents/harness/cli.mjs check
```

Your existing `AGENTS.md`, skills, settings and hooks are kept. Then fill in `AGENTS.md`, set `sensors.verify` in `.agents/harness.json` to your test command, and run `node .agents/harness/cli.mjs sync`.

Check that it works: put a fake value in a `.env` file, start a new agent session, and ask it to run `cat .env`. It should be refused, and told to read `.env.example`.

Other ways in:

```bash
npx skills add aelena/agent-harness                 # the skills only, any agent
```

```
/plugin marketplace add aelena/agent-harness        # Claude Code plugin: skills, subagents, guard
/plugin install agent-harness@agent-harness
```

## What is inside

| Part | Where | What it does |
| --- | --- | --- |
| Map | [`AGENTS.md`](AGENTS.md) | The short file every agent reads first. Budgeted, with a generated list of conventions. |
| Skills | [`.agents/skills/`](.agents/skills) | Nine skills, listed below. |
| Subagents | [`.agents/agents/`](.agents/agents) | `explorer` (read-only, cheap, cites `path:line`) and `reviewer` (read-only, fresh context). |
| Guard | [`lib/policy.mjs`](.agents/harness/lib/policy.mjs), [`lib/shell.mjs`](.agents/harness/lib/shell.mjs) | Allow, ask or deny before a tool call. |
| Sensors | [`lib/sensors.mjs`](.agents/harness/lib/sensors.mjs) | Checks after an edit, and the stop gate. |
| Dialects | [`lib/dialects.mjs`](.agents/harness/lib/dialects.mjs) | Each agent's hook payload and reply format, in one file. |
| Tooling | [`cli.mjs`](.agents/harness/cli.mjs) | `check`, `sync`, `eval`, `install`, `new-skill`. |
| Conventions | [`docs/conventions/`](docs/conventions) | This repository's rules. Each states how it is enforced. |
| Evals | [`evals/`](evals) | 93 guard scenarios, and trigger cases for every skill the model may invoke. |
| Tutorial | [`docs/tutorial/`](docs/tutorial/README.md) | Ten chapters: how a harness works and how to build one. |

## Skills

<!-- harness:skills:start -->
### Workflow

Research, plan, implement and review, one reviewable step at a time.

| Skill | What it does | Started by |
| --- | --- | --- |
| [`fresh-review`](.agents/skills/fresh-review/SKILL.md) | Get an independent review of the current changes from a subagent that has not seen this conversation, checked against the plan or the stated intent. | you or the model |
| [`rpi-implement`](.agents/skills/rpi-implement/SKILL.md) | Implement exactly one phase of an approved plan (a plan file, or a GitHub or GitLab plan issue), verify it, record progress in the plan, and stop for review without committing. | you |
| [`rpi-plan`](.agents/skills/rpi-plan/SKILL.md) | Turn a task into a phased implementation plan of vertical slices with public contracts and a test strategy, approved by the user and stored as a plan file, GitHub issues or GitLab issues. | you |
| [`rpi-research`](.agents/skills/rpi-research/SKILL.md) | Research how the codebase works today for a task or question and save the findings as a cited research file. | you |

### Harness

Skills that maintain the harness itself.

| Skill | What it does | Started by |
| --- | --- | --- |
| [`convention-capture`](.agents/skills/convention-capture/SKILL.md) | Turn a correction the user just made, or a convention they describe, into a permanent part of the harness - an automated check when the rule can be tested by a machine, a convention doc otherwise. | you or the model |
| [`harness-audit`](.agents/skills/harness-audit/SKILL.md) | Audit how well a repository is set up for coding agents - instructions, docs, guardrails, feedback loops, verification - and report the gaps in order of payoff. | you or the model |
| [`session-handoff`](.agents/skills/session-handoff/SKILL.md) | Write a handoff note that lets a fresh session continue this work with no other context - goal, state, decisions, dead ends, next step. | you or the model |

### Git

Git operations that follow the team conventions.

| Skill | What it does | Started by |
| --- | --- | --- |
| [`git-commit`](.agents/skills/git-commit/SKILL.md) | Create one git commit with a Conventional Commits message and an AI co-author trailer. | you or the model |

### Specs

Working with OpenSpec.

| Skill | What it does | Started by |
| --- | --- | --- |
| [`openspec-baseline`](.agents/skills/openspec-baseline/SKILL.md) | Write OpenSpec specs for behaviour that already exists in the code, from evidence in contracts, implementation and tests, so that later changes can modify or remove it instead of only adding to it. | you |
<!-- harness:skills:end -->

The typical flow: `/rpi-research <task>`, review the research, `/rpi-plan <research file>`, approve the plan, then `/rpi-implement <plan>` once per phase, with `/fresh-review` and `/git-commit` after each.

## The guard

| Rule | Default | Catches |
| --- | --- | --- |
| `env-dump` | deny | `env`, `printenv`, `export -p`, `Get-ChildItem Env:`, `cmd /c set` |
| `secret-echo` | deny | `echo $GITHUB_TOKEN` |
| `secret-file` | deny | Reading, copying or uploading `.env`, keys and cloud credentials, by shell or file tool |
| `destructive-rm` | deny | `rm -rf` of `/`, `~`, `.`, `*`, `.git` |
| `skip-verification` | deny | `--no-verify`, `HUSKY=0`, `core.hooksPath` overrides |
| `git-force-push` | ask | `git push --force` and its variants |
| `git-destructive` | ask | `reset --hard`, `clean -f`, `checkout -- path`, `branch -D` |
| `pipe-to-shell` | ask | `curl ... \| sh` |
| `protected-path` | ask or deny | Writes to `.git/`, lockfiles, and the harness's own configuration |

Change a default, add secret paths, protect your own paths or add a pattern in `.agents/harness.json`. No code needed: see [chapter 5](docs/tutorial/05-guardrails.md).

The guard stops honest mistakes by a cooperative agent. It is not a sandbox: [what it cannot see](docs/conventions/hooks/policy-rules.md).

## Agent support

| Agent | Rules | Skills | Guard, sensors, stop gate | Status |
| --- | --- | --- | --- | --- |
| Claude Code | `CLAUDE.md` importing `AGENTS.md` | `.claude/skills` link or copy | `.claude/settings.json` | Run end to end in a live session |
| Cursor | Native | Native | `.cursor/hooks.json` | Tested against documented payloads |
| GitHub Copilot | Native | Native | `.github/hooks/harness.json` | Tested against documented payloads |
| Codex | Native | Native | `.codex/hooks.json` | Tested against documented payloads |
| Gemini CLI | `.gemini/settings.json` | Native | `.gemini/settings.json` | Opt-in, tested against documented payloads |
| OpenCode | Native | Native | `.opencode/plugins/` (guard only) | Opt-in, written to the documented API, not run |

"Tested against documented payloads" means the hook scripts are run as subprocesses with the input each vendor documents and must produce the reply that vendor documents. It does not mean the product was driven. Details and sources: [chapter 8](docs/tutorial/08-portability.md).

## Commands

```bash
npm run verify        # check + tests + policy evals: the command CI and the stop gate run
npm run check         # lint skills, subagents, docs, links, config, generated files
npm run sync          # regenerate every agent's wiring
npm test              # node --test
npm run eval          # guard scenarios against the configured policy

node .agents/harness/cli.mjs new-skill <name> --group <group>
node .agents/harness/cli.mjs eval triggers --live     # needs Claude Code, uses model quota
node .agents/harness/cli.mjs install <dir>
```

## Also in this repository

- [`plugins/controlled-english`](plugins/controlled-english/README.md): an output style for short, literal, active-voice answers.
- [`plugins/ts7-lsp`](plugins/ts7-lsp/README.md): TypeScript code intelligence through the TypeScript 7 native compiler.
- [`openspec/schemas/spec-plan`](openspec/schemas/spec-plan/schema.yaml): an [OpenSpec](https://openspec.dev) schema that produces lean specs and one phased `plan.md`. Install it with `npx degit aelena/agent-harness/openspec/schemas/spec-plan openspec/schemas/spec-plan` and set `schema: spec-plan` in `openspec/config.yaml`.

## Credits

This started as a study of [CodelyTV/agent-harness](https://github.com/CodelyTV/agent-harness). The shared `.agents/` layout, plans as vertical slices implemented one phase at a time, convention docs with good and bad examples, the OpenSpec baseline skill and schema, and the two plugins come from there. The engine, the policy, the sensors, the tooling, the tests and the tutorial are new. [What changed and why](docs/tutorial/02-anatomy.md#how-this-differs-from-the-repository-it-started-from).

## License

[MIT](LICENSE)
