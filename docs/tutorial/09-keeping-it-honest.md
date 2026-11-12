# 9. Keeping it honest

A harness is software that supervises other software, and it rots like any other: a doc points at a file that moved, a skill's description stops matching what it does, a guard rule quietly stops firing. The difference is that nothing crashes. The agent just gets a little worse, and nobody knows why.

So the harness needs its own harness: a linter, tests, evals, CI, and regular pruning.

## The linter: `harness check`

`harness check` is the computed sensor for the harness itself. It runs in under a second, and every finding names the file, the rule and the fix.

```text
error  .agents/skills/deploy/SKILL.md  [skill/name]
       `name` is "deployer" but the folder is "deploy". They must match: agents resolve a skill by its folder.
```

| Rule | What it catches |
| --- | --- |
| `skill/missing`, `skill/frontmatter` | A skill folder with no `SKILL.md`, or frontmatter that does not parse. |
| `skill/name` | A name that differs from the folder, or breaks the naming rules. |
| `skill/description`, `skill/trigger` | No description, one over budget, or one with no "Use when" on a model-invocable skill. |
| `skill/duplicate-description` | Two skills the model cannot tell apart. |
| `skill/invocation`, `skill/group`, `skill/version` | Missing explicit fields. |
| `skill/size` | A body over the line budget. |
| `skill/self-contained`, `skill/broken-link` | A link that leaves the skill folder, or resolves to nothing. |
| `skill/orphan-resource` (warning) | A resource file nothing refers to. |
| `agent/*` | Subagent frontmatter, and a missing `tools` list (warning). |
| `docs/agents-md`, `docs/agents-md-size` | No `AGENTS.md`, or one over budget. |
| `docs/broken-link` | A relative link in any Markdown file that does not resolve. |
| `docs/convention-sections` | A convention without Rule, Why, Examples or Enforcement. |
| `json/parse` | Any JSON file that does not parse. |
| `config/*` | Unknown agents, unknown policy rules, patterns that do not compile, malformed sensors. |
| `evals/policy-coverage` | A guard rule with no scenario. |
| `evals/trigger-coverage`, `evals/unknown-skill` | A model-invocable skill without two positive cases and one near-miss. |
| `sync/drift` | Generated output that differs from what `sync` would write. |

Each of these exists because the matching defect was found in a real harness, most of them in the repository this one started from: a docs map that listed a file that did not exist, two skills with the same description, a manifest that had fallen behind the skills on disk, a link to a convention that was never written.

The same linter is wired in as a post-edit sensor in this repository, so an agent that breaks a skill is told on its next step.

## Tests

`npm test` runs three files with Node's built-in test runner. No framework, no install.

- **`tests/policy.test.mjs`** runs every line of `evals/policy.jsonl` through the policy, and tests the shell reader directly.
- **`tests/hooks.test.mjs`** is the important one. It runs the real hook scripts as subprocesses, feeds them the payload each agent documents, and asserts the exact reply that agent expects, including the failure cases: garbage on stdin, a broken config file, the Cursor stand-down.
- **`tests/harness.test.mjs`** covers the tooling: the frontmatter reader, each lint rule against a deliberately broken project, sync (idempotent, merges, detects drift, will not delete a folder it does not own), and install.

One test deserves a mention: `check: this repository passes its own linter`. The harness is its own first user.

## Evals

A test asks "does the code do what the code says?". An eval asks "does the harness still behave the way we decided it should?". The cases are data, kept in `evals/`, and they are the record of those decisions.

### Policy evals: deterministic

`evals/policy.jsonl` has one case per line:

```json
{"kind":"shell","command":"git commit --no-verify -m \"wip\"","expect":"deny","rule":"skip-verification"}
{"kind":"shell","command":"git commit -m \"docs: explain --no-verify policy\"","expect":"allow","why":"the flag is inside the message"}
```

`npm run eval` runs them against the policy *as configured for your project*, so they also tell you what your overrides changed. Ninety-three cases ship. About a third are near-misses: commands that look dangerous and are not. Those are the cases that stop a guard from becoming a nuisance.

Whenever the guard gets something wrong in real use, in either direction, the fix starts with a new line in this file.

### Trigger evals: need a model

Whether a skill loads when it should cannot be computed. It depends on how a model reads the description. `evals/triggers.jsonl` records what you expect:

```json
{"prompt":"I'm stopping for today, save where we are so I can pick this up tomorrow","expect":"session-handoff"}
{"prompt":"summarize what this repository does","expect":null,"not":["session-handoff"]}
```

There are two levels of checking:

- **Coverage, computed.** `harness check` fails when a model-invocable skill lacks two positive cases and one near-miss. This runs everywhere, for free.
- **Behaviour, with a model.** `harness eval triggers --live` sends each prompt to a headless Claude Code session and reads which skill it loaded from the event stream. It uses your model quota, so it is run by hand: after changing a description, or after a model upgrade. A skill counts as loaded when the agent calls the Skill tool or opens the skill's `SKILL.md`. The reader of the event stream is unit-tested, and three of the fifteen shipped cases were run live while this repository was built (two positives and a near-miss, all passing). The rest have not been run, so treat the file as a starting set.

When a trigger eval fails, change the description, not the prompt. The prompt is how people actually ask.

## CI

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs one command, `npm run verify`, on Linux, Windows and macOS. It is the same command the stop gate runs locally. An agent that ends its turn green has therefore passed what CI will check, and a red CI run means something a local run would also have caught.

## Drift

Every generated file is a copy, and copies drift. The defence is the pair from [chapter 8](08-portability.md): `sync` regenerates, `check` compares. Anything that can be derived should be: the skills table in the README, the conventions list in `AGENTS.md`, the plugin manifest, the hook configs. A list that a person must remember to update is a list that will be wrong.

For hand-written text the defences are weaker, and it is worth knowing where they stop:

- A link to a file that is gone is caught.
- A path named in backticks is not.
- A doc that describes behaviour the code no longer has is not. Review is the only sensor for that.

## Pruning

A harness grows by accretion. Every mistake adds a rule, and nothing removes one. After a year there are two hundred lines of instructions, a third of them obsolete, and the agent's attention is spread across all of them.

Two habits keep it lean.

**Ask what each part assumes.** Every guide and every sensor exists because, at some point, the model could not be trusted to do something alone. Those assumptions expire. A rule added for last year's model may be dead weight for this year's. After a model upgrade, pick a few instructions, remove them, and see whether anything gets worse. If not, they stay removed.

**Prefer the cheaper cell.** When you revisit a rule, ask whether it can move: from an always-loaded instruction to a convention read on demand, from a convention to a check. Each move frees context and makes the rule more reliable.

The `harness-audit` skill does a structured version of this for any repository: it goes through a [checklist](../../.agents/skills/harness-audit/resources/checklist.md) of guides and sensors, looks for the failure history (instructions in capitals, repeated corrections), and reports the gaps in order of payoff.

## What to watch

You cannot improve what you do not notice. A few cheap signals:

- **Repeated corrections.** The same thing said to the agent twice is a missing convention or check.
- **Blocks by rule.** A guard rule that fires often on legitimate work needs a near-miss case and a narrower condition. One that never fires may be dead.
- **Stop-gate failures.** If the agent regularly reaches the block limit, the verification is flaky or too slow, or the tasks are too large.
- **Skills that never load.** Either nobody needs them, or the description is missing the words people use.
- **The size of the always-loaded text.** It only ever grows unless someone watches it.

Next: [adopt it](10-adopt.md).
