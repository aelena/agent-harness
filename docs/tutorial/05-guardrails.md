# 5. Guardrails

A guardrail is a computed sensor that runs *before* an action and can stop it. This chapter builds one from nothing, shows why the obvious version fails, and then explains the one in this repository.

## How a hook works

Every agent in this tutorial lets you register a command that runs before a tool call. The agent writes the pending call to the command's stdin as JSON, waits, and reads the answer from stdout and the exit code. In Claude Code the registration lives in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/guard.mjs"] }] }
    ]
  }
}
```

Three things can come back: allow the call, deny it with a reason the model will read, or ask the user to confirm.

## Version 1: twenty lines

Save this as `guard.mjs` in a scratch repository, with the registration above:

```js
import { readFileSync } from 'node:fs';

const payload = JSON.parse(readFileSync(0, 'utf8'));          // the tool call, from stdin
const command = payload.tool_input?.command ?? '';

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.exit(0);
}

if (/\bcat\s+\.env\b/.test(command)) {
  deny('Reading .env exposes credentials. Read .env.example for the variable names instead.');
}
// no output and exit 0: no opinion, the call proceeds
```

Ask the agent to run `cat .env`. It is refused, it reads your reason, and it changes course. That is a working guardrail, and the mechanism never gets more complicated than this: JSON in, verdict out.

## Why version 1 is not enough

Now try `head .env`, `cat ./.env`, `bash -c "cat .env"`, `grep KEY < .env`. All pass. Widen the pattern to anything containing `.env` and you block `cat .env.example` and `git add .envrc`.

This is the trap of matching text. The repository this harness started from blocked every command containing the word `export`, to stop the environment from being listed. The result:

| Command | What it does | Substring rule |
| --- | --- | --- |
| `npm run export` | Runs a build script | Blocked, wrongly |
| `grep -rn "export default" src/` | Searches code | Blocked, wrongly |
| `export NODE_ENV=test` | Sets a variable, prints nothing | Blocked, wrongly |
| `env` | Prints every variable | Allowed, wrongly |
| `printenv \| grep TOKEN` | Prints the tokens | Allowed, wrongly |
| `cat .env` | Prints the secrets file | Allowed, wrongly |

A guard that blocks ordinary work gets turned off, and one that misses the real leak protects nothing. Both failures have the same cause: the rule looks at characters, and the danger is in what the command *does*.

## Version 2: judge the structure

The policy in this repository works in three steps.

### Step 1: read the command

[`lib/shell.mjs`](../../.agents/harness/lib/shell.mjs) turns a command line into the list of simple commands it would run. It does not execute or expand anything. It handles quoting, `;` `&&` `||` `|`, redirects, `$(...)` and backticks, heredocs, wrappers (`sudo`, `env`, `timeout`, `xargs`), leading `VAR=value` assignments, and nested shells (`bash -c "..."`, `eval`, `cmd /c`, `powershell -Command`).

```js
analyze('FOO=1 sudo bash -c "cd app && printenv | sort" > out.txt')
// → bash, cd, printenv, sort   (with args, redirects, and which command pipes into which)
```

Now `echo "run env to list variables"` is a command named `echo` with one argument, and the word `env` inside the quotes is data.

### Step 2: apply rules to commands

[`lib/policy.mjs`](../../.agents/harness/lib/policy.mjs) checks each command against rules written in terms of names and arguments:

```js
// `export FOO=bar` sets a variable. Only a bare `export` or `export -p` lists the environment.
if (name === 'export' && (positional.length === 0 || lower.includes('-p'))) hit('env-dump');
```

The rules that ship:

| Rule | Default | Catches |
| --- | --- | --- |
| `env-dump` | deny | `env`, `printenv`, `export -p`, `declare -x`, `Get-ChildItem Env:`, `cmd /c set`, `/proc/self/environ` |
| `secret-echo` | deny | `echo $GITHUB_TOKEN`: printing a variable whose name looks like a credential |
| `secret-file` | deny | Reading, copying or uploading `.env`, keys, cloud credentials, by shell or by file tool |
| `destructive-rm` | deny | Recursive forced delete of `/`, `~`, `.`, `*`, `.git`, a drive root |
| `skip-verification` | deny | `--no-verify`, `git commit -n`, `HUSKY=0`, `core.hooksPath` overrides |
| `git-force-push` | ask | `git push --force`, `-f`, `+refspec`, `--force-with-lease` |
| `git-destructive` | ask | `reset --hard`, `clean -f`, `checkout -- path`, `branch -D`, `stash drop` |
| `pipe-to-shell` | ask | `curl ... \| sh`, `irm ... \| iex` |
| `protected-path` | ask or deny | Writing to `.git/`, lockfiles, or the harness's own configuration |

File tools go through the same policy. A `Read` of `.env` and a `cat .env` hit the same rule.

### Step 3: decide, and say what to do instead

Each rule has a decision and a reason. When several fire, the most severe wins.

| Decision | Use when | Example |
| --- | --- | --- |
| `deny` | Never right for an agent, and a safe alternative exists. | Reading `.env` |
| `ask` | Sometimes right, and a person can tell in seconds. | Force-push |
| `allow` | Everything else. | |

The reason is written for the model, as an instruction ([convention](../conventions/hooks/messages-are-instructions.md)):

```text
Blocked by harness policy [skip-verification]: This bypasses the commit and push checks.
Read the failure, fix its cause, and run the command again without the bypass.
```

Compare with "Blocked: not allowed by security policy". The first tells the agent what to do next. The second leaves it to stop or to find a way around.

## Configure it without code

Project rules go in `.agents/harness.json`:

```json
{
  "policy": {
    "rules": { "git-force-push": "deny", "pipe-to-shell": "off" },
    "secretPaths": ["*.vault", "config/master.key"],
    "protectedPaths": [
      { "glob": "db/migrations/2024*", "decision": "deny", "reason": "Applied migrations are immutable. Add a new migration." }
    ],
    "custom": [
      { "id": "no-prod-db", "pattern": "psql .*prod", "decision": "deny", "reason": "Do not connect to production. Use the staging database: `npm run db:staging`." }
    ]
  }
}
```

`rules` overrides a default (`allow`, `ask`, `deny`, `off`). The lists extend the defaults. `harness check` rejects an unknown rule id or a pattern that does not compile.

## Add a rule in code

When a regular expression is not enough:

1. Add the id, default and reason to `RULES` in `lib/policy.mjs`.
2. Add the condition to `checkCommand`, written against `name`, `args`, `redirects` or `pipedFrom`.
3. Add scenarios to `evals/policy.jsonl`: one that must be blocked, and a **near-miss** that must pass.

   ```json
   {"kind":"shell","command":"terraform destroy -auto-approve","expect":"deny","rule":"infra-destroy"}
   {"kind":"shell","command":"terraform plan -destroy","expect":"allow","why":"a plan changes nothing"}
   ```

4. Run `npm test`. `harness check` fails while a rule has no scenario (`evals/policy-coverage`).

The near-miss is what keeps a rule from growing until it blocks normal work.

## The harness guards itself

An agent that is blocked by a hook can, in principle, edit the hook. So the hook configuration files and `.agents/harness/**` are protected paths with the decision `ask`: the agent may propose a change to its own guardrails, and a person confirms it. `git commit --no-verify` is denied for the same reason. A check that can be skipped silently is not a check.

## Two design decisions worth copying

**Fail open, loudly.** If the guard itself crashes (bad payload, broken config), it prints the error to stderr and answers "no opinion". The alternative, blocking every tool call until someone repairs the hook, teaches people to remove the hook. This is deliberate and it is tested: `tests/hooks.test.mjs` feeds each dialect garbage and expects a valid, neutral reply. A broken *config file* is different: the default policy still applies.

**Degrade `ask` to `deny` where an agent cannot ask.** Codex ignores an "ask" verdict and runs the command. Cursor honours it for shell commands and not for file edits. In those places the harness answers `deny` and tells the agent to have the user approve or run the action. Failing towards safety is the only sound default.

## What a guard is not

The guard stops honest mistakes by a cooperative agent. It is not a security boundary. It cannot see a command assembled at run time, the inside of a script, or a secret read through `grep -r KEY .` ([the full list of gaps](../conventions/hooks/policy-rules.md)). For real containment, layer it:

1. **Keep secrets out of reach.** Do not export production credentials in the shell you start the agent from. Nothing can leak what is not there.
2. **Use the agent's own controls**: permission rules that deny tools or paths, and its sandbox where it has one.
3. **Then the guard**, for the mistakes that the first two layers do not cover, with messages that steer the agent back.

## Exercise

1. Build version 1 and watch it block `cat .env`, then defeat it with `head .env`.
2. Install this harness in the same scratch repository ([chapter 10](10-adopt.md)) and try both again.
3. Add a `custom` rule for a command that is dangerous in *your* project, with a reason that names the safe alternative. Ask the agent to run the command and read how it responds to your reason.

Next: [feedback loops](06-feedback-loops.md).
