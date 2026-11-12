# 6. Feedback loops

A guard stops a bad action before it happens. Most mistakes are not bad actions, though. They are ordinary edits that turn out to be wrong. For those the harness needs sensors that run *after* the work and tell the agent, quickly and specifically, that something broke.

An agent with good feedback corrects itself. An agent without it produces work that looks finished, and you become the sensor.

## Three loops, three speeds

| Loop | Runs | Typical cost | Catches | Here |
| --- | --- | --- | --- | --- |
| After each edit | Every file change | Under a few seconds | Syntax, format, lint, structure of the edited file | `hooks/feedback.mjs` |
| Before stopping | Every time the agent says "done" | Up to a few minutes | Types, tests, the build, cross-file breakage | `hooks/stop-gate.mjs` |
| Review | At the end of a phase | A model call | Wrong behaviour, missing tests, scope | `fresh-review` |

The first two are computed. The third is inferred, and it is last because it is the most expensive and the least reliable. Everything the first two can catch should never reach it.

## Loop 1: sensors after an edit

The earlier an error reaches the agent, the cheaper it is to fix: the edit is still in the model's attention, and nothing else has been built on top of it. A syntax error found thirty tool calls later costs a re-read of everything in between.

Configure sensors in `.agents/harness.json`:

```json
{
  "sensors": {
    "postEdit": [
      { "name": "syntax", "match": "**/*.mjs", "run": "node --check {file}" },
      { "name": "lint",   "match": "src/**/*.ts", "run": "npx eslint --quiet {file}" },
      { "name": "harness check", "match": ".agents/skills/**", "run": "node .agents/harness/cli.mjs check --for {file}" }
    ]
  }
}
```

After an edit, [`lib/sensors.mjs`](../../.agents/harness/lib/sensors.mjs) runs each entry whose `match` fits the edited path, with `{file}` replaced by it. If one exits non-zero, its output is handed to the agent as feedback on the edit it just made.

Rules for a good post-edit sensor:

- **Fast.** It runs on every edit. A few seconds at most. Check the one file, not the project.
- **Silent on success.** The hook prints nothing when everything passes. Output on success costs context on every edit and trains the agent to skim.
- **Specific on failure.** File, line, what is wrong, how to fix it.
- **Not a formatter.** Do not rewrite the file behind the agent's back: its next edit will be based on content that no longer exists. Report, and let the agent fix.

### The error message is the lesson

A custom check lets you write the failure message yourself, and that message is a prompt delivered at exactly the right moment. This is the cheapest way to teach an agent your architecture:

```text
src/app/api/users/route.ts:3  import from "src/infrastructure/db" is not allowed in a route handler.
Route handlers call an application service and nothing else (docs/conventions/backend/thin-api-routes.md).
Move the query into a service under src/contexts/users/application/ and call that.
```

One such message, seen once, does more than a paragraph in `AGENTS.md` read at the start of the session. It is also why [chapter 3](03-instructions-and-knowledge.md) gives every convention an Enforcement section: a rule that a check can express should live in the check, and the doc should explain the reason.

## Loop 2: the stop gate

Agents declare victory early. "All tests pass" is sometimes a prediction, not a report. The stop gate turns it into a fact.

```json
{ "sensors": { "verify": "npm run --silent verify", "verifyTimeoutSec": 120, "maxStopBlocks": 3 } }
```

When the agent tries to end its turn, the hook runs `verify`. On failure the agent does not stop. It receives:

```text
You are not done: the verification command failed (exit 1).
Command: npm run --silent verify

✖ sync: fills marked blocks and manifests from skill metadata
  AssertionError: Expected values to be strictly deep-equal ...

Fix the cause and finish again. Do not weaken or delete a check to make it pass.
If you cannot fix it, say exactly what fails and what you tried.
(attempt 1 of 3)
```

This is **back-pressure**: the work cannot leave until it meets the bar.

A naive stop gate is slow and can loop forever. This one has three protections:

- **It skips when nothing changed.** With a clean git tree there is nothing new to verify. Otherwise it fingerprints the uncommitted files and remembers the fingerprint of the last passing run, so a turn that only answered a question costs nothing.
- **It gives up politely.** After `maxStopBlocks` consecutive failures in one session it lets the agent stop and tells you on stderr. A check that cannot pass must not trap a session.
- **It keeps the tail.** Long output is cut to its last 4,000 characters, because the end of a failing run is where the error is.

### Design the verify command for an agent

The stop gate is only as good as the command behind it.

- **One command.** `npm run verify` here runs the linter, the tests and the policy evals. `AGENTS.md` names it. CI runs the same one, so a local pass means what a CI pass means.
- **Fast enough to run at every stop.** If the full suite takes twenty minutes, verify a fast subset and leave the rest to CI.
- **Quiet when green.** Three hundred lines of passing tests are three hundred lines of context spent on nothing. Use the quiet reporter.
- **Deterministic.** A flaky test teaches the agent that failures can be ignored. It will be right just often enough to be dangerous.

### "Do not weaken the check"

An agent under back-pressure has two ways out: fix the code, or fix the test. The harness closes the second door in three places. The stop-gate message says so. The `rpi-implement` skill says so. And the guard denies `--no-verify`, so the cheapest shortcut does not exist. When verification still fails after the limit, the agent is told to report exactly what fails, which is the outcome you want.

## Loop 3: review

Computed sensors answer "does it run?" and "does it follow the rules?". They cannot answer "is this what was asked for?". That takes judgment, and the judgment must come from something that did not write the code.

`fresh-review` ([chapter 4](04-skills-and-workflow.md)) is that sensor. What makes it work is in its construction:

- **A fresh context.** The reviewer starts with the intent and the diff and nothing else.
- **An intent to measure against.** A diff alone can only be judged for style. With the plan's contracts and tests, the reviewer can find what is missing.
- **Findings with a trigger.** Each finding names the input or state that makes it fail, or is labelled a suspicion.
- **Verification before action.** The main session checks each finding against the code. An inferred sensor can be wrong, so its output is treated as claims.

## From prose to sensor

The practical use of this chapter is a habit. When the agent breaks a rule that was already written down, do not make the prose louder. Ask what could have *detected* the violation:

| The rule in prose | The sensor |
| --- | --- |
| "Handlers must not query the database." | An import restriction in the linter, with a message naming the service layer. |
| "Every use case needs a test." | A check that each file under `application/` has a matching test file. |
| "Do not edit generated files." | A protected path in the guard policy. |
| "Run the migrations check before finishing." | Add it to `verify`. |
| "Skill descriptions must say when to use them." | `skill/trigger` in `harness check`, which is how this repository does it. |

## Exercise

1. Add a `postEdit` sensor for your main language's syntax or lint check. Introduce a deliberate error through the agent and watch it correct itself on the next step.
2. Set `sensors.verify` to your test command and run `harness sync`. Ask the agent for a change that breaks a test, and tell it nothing about testing. Does it end its turn green?
3. Pick one rule from your `AGENTS.md` that is written in capitals. Design the sensor that would replace it.

Next: [context](07-context.md).
