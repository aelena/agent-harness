# 10. Adopt it

This chapter installs the harness in a repository of yours and gives an order for growing it. If you built your own along the way, use the order and skip the install.

## Install

You need Node 20 or newer. From a clone of this repository:

```bash
node .agents/harness/cli.mjs install /path/to/your/repo
```

Options: `--agents claude,cursor` to choose agents (default: claude, cursor, copilot, codex; `gemini` and `opencode` are opt-in), `--skills rpi-plan,git-commit` to choose skills (default: all), `--force` to replace skills you already have.

What it does:

| Step | Files | If they already exist |
| --- | --- | --- |
| Copies the engine | `.agents/harness/` | Replaced. It is vendored code, so running install again is the upgrade. |
| Copies skills and subagents | `.agents/skills/`, `.agents/agents/` | Kept, unless `--force`. |
| Creates the config | `.agents/harness.json` | Kept. |
| Creates the map | `AGENTS.md`, from the template | Kept. |
| Adds ignore rules | `.gitignore` | Missing lines are appended. |
| Wires the agents | `CLAUDE.md`, `.claude/settings.json`, `.cursor/hooks.json`, `.github/hooks/harness.json`, `.codex/hooks.json` | Your own entries are kept. Only harness entries are managed. |

Then, in your repository:

```bash
node .agents/harness/cli.mjs check
```

Commit everything except what `.gitignore` now excludes.

To use only the skills, without hooks or tooling, the folder layout also works with the generic installer (`npx skills add <owner>/<repo>`) and as a Claude Code plugin (`/plugin marketplace add <owner>/<repo>`). The plugin brings the skills, the subagents and the guard with its default policy.

## Check that it works

One minute, in each agent you enabled:

1. Create a `.env` with a fake value: `echo "CANARY=12345" > .env`.
2. Start a new session and ask: "Run `cat .env` and show me the output."
3. The agent should report that the harness policy blocked it, name the `secret-file` rule, and suggest `.env.example`. The value must not appear.

If the command runs, the hook is not firing. See the troubleshooting list below.

Some agents ask you to approve project hooks before they run them: Codex has a `/hooks` review, Gemini CLI fingerprints hook commands, and Claude Code and Cursor ask you to trust the workspace. That is the agent protecting you from a repository you did not write, and it is correct.

## Grow it in this order

Do not turn everything on at once. Each step pays for itself before the next, and each teaches you what your agents actually get wrong.

### Day 1: the map and the guard

1. **Fill in `AGENTS.md`.** The commands, the map, at most five rules. Under 60 lines. This alone removes the most common failures: wrong commands and files in the wrong place.
2. **Keep the default guard policy.** Run the `.env` check above.

### Week 1: verification

3. **Give the agent one command that verifies work**, and name it in `AGENTS.md`. If you have none, building it is the most valuable thing on this page.
4. **Set `sensors.verify`** to that command and run `harness sync`. Now the agent cannot finish on red.

   ```json
   { "sensors": { "verify": "npm run check", "verifyTimeoutSec": 180 } }
   ```

5. **Add one post-edit sensor**: the fastest per-file check you have (syntax, lint).

### Week 2: workflow

6. **Run the next real feature through `/rpi-research`, `/rpi-plan`, `/rpi-implement`.** Review the plan as carefully as you would review code.
7. **Use `/fresh-review` before each commit**, and `/git-commit` for the commit.

### From then on: the loop

8. **Every time you correct the agent twice, run `/convention-capture`.** Prefer the check over the doc.
9. **Add policy rules for your own dangerous commands**, each with a scenario in `evals/policy.jsonl`.
10. **Write a skill** when you notice you are typing the same multi-step instructions again.
11. **Once a quarter, and after a model upgrade, prune**: run `/harness-audit`, and delete instructions that no longer earn their place.

## The configuration file

Everything is in `.agents/harness.json`. The defaults are in [`lib/util.mjs`](../../.agents/harness/lib/util.mjs).

```json
{
  "agents": ["claude", "cursor", "copilot", "codex"],
  "sync": { "mode": "auto" },
  "budgets": { "agentsMdLines": 120, "skillBodyLines": 300, "descriptionChars": 1024 },
  "docs": { "conventions": "docs/conventions", "requiredSections": ["Rule", "Why", "Examples", "Enforcement"] },
  "ignore": ["vendor/**"],
  "groups": { "workflow": { "title": "Workflow", "description": "..." } },
  "sensors": {
    "postEdit": [{ "name": "lint", "match": "src/**/*.ts", "run": "npx eslint --quiet {file}" }],
    "verify": "npm run check",
    "verifyTimeoutSec": 180,
    "maxStopBlocks": 3
  },
  "policy": {
    "rules": { "git-force-push": "deny" },
    "secretPaths": [],
    "secretPathExceptions": [],
    "protectedPaths": [],
    "custom": []
  },
  "session": { "handoff": ".agents/handoff.md", "plans": ".agents/plans" }
}
```

After any change: `node .agents/harness/cli.mjs sync`, then `check`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| The `.env` check does not block. | The hook is not registered or not trusted. Run `harness sync --check`. In the agent, open its hooks view (`/hooks` in Claude Code and Codex) and confirm the guard is listed. Check that `node` is on the `PATH` the agent sees. |
| "Generated file is out of date." | Someone edited generated output, or the source changed. Run `harness sync` and commit. |
| The agent is asked to confirm every edit under `.agents/harness/`. | Intended: the guard protects itself. While you develop the harness itself, set `"rules": { "protected-path": "off" }` in a local, uncommitted change, or approve the prompts. |
| A legitimate command is blocked. | Add it to `evals/policy.jsonl` as an `allow` case, see it fail, then narrow the rule or turn it down in `policy.rules`. |
| The stop gate runs at every turn and is slow. | It runs when uncommitted files changed since the last pass. Make `verify` faster or quieter, or commit more often. |
| The stop gate gave up after three attempts. | The verification cannot pass as things stand: read the agent's report. Raise `maxStopBlocks` only if the check is sound and the tasks are simply large. |
| Hooks run twice in Copilot or Cursor. | Both also read `.claude/settings.json`. Cursor is handled. For Copilot see [chapter 8](08-portability.md). |
| `.claude/skills` is a text file containing a path. | A symlink committed on another system and checked out on Windows. Delete it and run `harness sync`. This repository does not commit that link, for this reason. |
| A skill does not load when it should. | Its description lacks the words you used. Add the phrasing to "Use when", add the prompt to `evals/triggers.jsonl`, and rerun the trigger evals. |

## The checklist

A compact version of the whole tutorial. The full one, with evidence to collect, is the [audit checklist](../../.agents/skills/harness-audit/resources/checklist.md).

- [ ] `AGENTS.md` is short, current, and names the command that verifies work.
- [ ] Conventions are files in the repository, one rule each, each stating how it is enforced.
- [ ] Rules that a machine can check are checked by a machine.
- [ ] Repeated tasks are skills with descriptions that say when to use them.
- [ ] Non-trivial work goes through a reviewed plan before code.
- [ ] Secrets are unreadable and destructive commands are guarded, in every agent the team uses.
- [ ] Block messages and check failures tell the agent what to do instead.
- [ ] The agent gets feedback after edits and cannot finish while verification fails.
- [ ] Changes are reviewed by something that did not write them.
- [ ] Exploration is delegated, and state lives in files.
- [ ] The harness has a linter, tests and evals, and they run in CI.
- [ ] Rules get removed.

## The one habit

If you take a single thing from this tutorial, take the question from chapter 1. When the agent gets something wrong, do not only fix the output, and do not only rephrase the prompt. Ask:

> What would have prevented this, or caught it sooner?

Then change the harness so that the answer is in the repository. Each mistake handled that way is one the agent does not make again, for anyone on the team, in any agent. That compounding is the whole point of building a harness.

Back to the [index](README.md).
