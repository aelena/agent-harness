# 8. Portability

A team rarely uses one agent. Someone prefers Cursor, CI runs Copilot's cloud agent, a colleague lives in a terminal with Claude Code or Codex. If each has its own instructions and its own guardrails, you have several harnesses, and they drift apart.

The goal of this chapter: **one source, every agent.** It covers what the agents share, where they differ, and how this harness hides the difference.

Everything in the tables below was checked against each vendor's documentation on 2026-11-12. Agents change quickly: treat the tables as a snapshot and the method as the lasting part.

## What the agents already share

More than you might expect. Two open conventions did most of the work.

| | `AGENTS.md` | Skills in `.agents/skills/` | Subagents |
| --- | --- | --- | --- |
| Claude Code | Through `CLAUDE.md` with an `@AGENTS.md` import | No: reads `.claude/skills/` | `.claude/agents/*.md` |
| Cursor | Native, root and nested | Native | Reads `.claude/agents/` too |
| GitHub Copilot | Native, nearest file wins | Native | `.github/agents/*.agent.md` |
| Codex | Native, root down to the working directory | Native | `.codex/agents/*.toml` |
| OpenCode | Native | Native | `.opencode/agents/*.md` |
| Gemini CLI | Only if `context.fileName` lists it | Native (alias of `.gemini/skills/`) | `.gemini/agents/*.md` |

So the portable core is simple: write rules in `AGENTS.md` and skills in `.agents/skills/`. Only Claude Code needs two small bridges, and `harness sync` builds both:

- `CLAUDE.md` containing `@AGENTS.md`. An import, not a symlink, so it works on Windows without extra setup.
- `.claude/skills` pointing at `.agents/skills`: a symlink where the system allows one, a copy where it does not. It is not committed. The session-start hook recreates it after a fresh clone.

The repository this harness started from created six symlinks with six bash scripts, one per agent. Five of them are no longer needed.

## Where they differ: hooks

Hooks have no shared standard. Every agent has the same idea (run a command before a tool call, read its verdict) and its own format for all of it.

**What arrives on stdin, for a shell command:**

| Agent | Event | Tool name | Where the command is |
| --- | --- | --- | --- |
| Claude Code | `PreToolUse` | `Bash`, `PowerShell` | `tool_input.command` |
| Cursor | `beforeShellExecution` | none | `command` at the top level |
| Copilot | `preToolUse` | `bash`, `powershell` | `toolArgs.command`, where `toolArgs` may be a JSON *string* |
| Codex | `PreToolUse` | `Bash`, `apply_patch` | `tool_input.command` (for `apply_patch`, the patch text) |
| Gemini CLI | `BeforeTool` | `run_shell_command` | `tool_input.command` |
| OpenCode | `execute.before` (in-process plugin) | `shell` | `event.input.command` |

**How to answer:**

| Agent | Deny | Ask the user | If the hook crashes |
| --- | --- | --- | --- |
| Claude Code | `hookSpecificOutput.permissionDecision: "deny"`, or exit 2 | `"ask"` | The call proceeds |
| Cursor | `{"permission":"deny","agent_message":...}`, or exit 2 | `"ask"`, for shell only | The call proceeds. Invalid JSON on exit 0 **blocks** |
| Copilot | `{"permissionDecision":"deny","permissionDecisionReason":...}` | `"ask"`, treated as deny in autopilot and in the cloud agent | The call is **denied** |
| Codex | Same shape as Claude Code, or exit 2 | Not supported: the call proceeds | The call proceeds |
| Gemini CLI | `{"decision":"deny","reason":...}`, or exit 2 | Not supported | The call proceeds |
| OpenCode | `throw new Error(reason)` | Through a separate permission hook | n/a |

**How to send feedback after an edit, and how to refuse to stop:**

| Agent | Feedback after an edit | Keep the agent working |
| --- | --- | --- |
| Claude Code | `PostToolUse`: exit 2, stderr goes to the model | `Stop`: `{"decision":"block","reason":...}` |
| Cursor | `postToolUse`: `{"additional_context":...}` | `stop`: `{"followup_message":...}` |
| Copilot | `postToolUse`: `{"additionalContext":...}` | `agentStop`: `{"decision":"block","reason":...}` |
| Codex | `PostToolUse`: exit 2, or `decision: "block"` | `Stop`: `{"decision":"block","reason":...}` |
| Gemini CLI | `AfterTool`: `hookSpecificOutput.additionalContext` | `AfterAgent`: `{"decision":"deny","reason":...}` |

Six agents, five payload shapes, five reply shapes. Written by hand, that is the policy implemented five times, which is exactly how the upstream repository ended up with four `export` checks using four different regular expressions.

## The adapter pattern

The harness isolates all of the above in one file, [`lib/dialects.mjs`](../../.agents/harness/lib/dialects.mjs), with two kinds of function:

```js
normalize(payload)                      // any agent's payload → { kind: 'shell'|'read'|'write'|'other', command, paths, ... }
guardReply(dialect, verdict, action)    // a verdict → that agent's stdout, stderr and exit code
feedbackReply(dialect, message)
stopReply(dialect, reason)
sessionReply(dialect, text)
```

`normalize` is tolerant by design. It does not ask which agent is calling. It looks for the command and the paths in every place any agent puts them, parses `toolArgs` if it is a string, and reads file paths out of an `apply_patch` body. The dialect name, passed as `--agent <name>` on the hook's command line, is needed only to format the reply.

Between the two sits the policy, which has never heard of an agent:

```js
// hooks/guard.mjs, in full
runHook('guard', ({ dialect, action, policy }) => guardReply(dialect, evaluate(action, policy), action));
```

Two details in the reply functions are worth noticing, because each came from a real difference in the tables:

- **`ask` degrades to `deny`** for an agent that cannot ask (Codex, Gemini CLI, Cursor outside shell commands), with a sentence telling the agent to have the user approve or run the action. Emitting `ask` to Codex would let the command through.
- **A neutral reply exists for every dialect.** When the hook fails internally it must still print something valid: for Cursor's permission hooks that is `{"permission":"allow"}`, because invalid JSON would block every command. For Copilot the script must exit 0, because a crash there is a denial.

## Generating the wiring

The other half is the configuration that makes each agent call the hooks. [`lib/sync.mjs`](../../.agents/harness/lib/sync.mjs) writes it from `.agents/harness.json`:

| Agent | File | Notes |
| --- | --- | --- |
| Claude Code | `.claude/settings.json` | Exec form (`command: "node"`, `args: [...]`): no shell, so no quoting problems on Windows. |
| Cursor | `.cursor/hooks.json` | Paths relative to the project root, which is the hook's working directory. |
| Copilot | `.github/hooks/harness.json` | The `command` field is the cross-platform fallback for `bash` and `powershell`. |
| Codex | `.codex/hooks.json` | Hooks run in the session's directory, so the script path is resolved from the git root. |
| Gemini CLI | `.gemini/settings.json` | Timeouts are in milliseconds. Also adds `AGENTS.md` to `context.fileName`. |
| OpenCode | `.opencode/plugins/harness-guard.js` | A plugin that imports the policy and calls it in-process. |

Three properties make generated wiring safe to live with:

- **It merges.** In a file you share with the harness, only the entries that point at `harness/hooks/` are replaced. Your own hooks and settings are kept. A test covers this.
- **It is idempotent.** A second run changes nothing.
- **Drift is an error.** `harness check` compares every generated file with what `sync` would write and fails on a difference, locally and in CI.

Hooks appear only when configured: without `sensors.verify` there is no stop hook, so no process is spawned for nothing.

## The double-fire trap

Agents have started reading each other's configuration, to make migration easy. Cursor loads `.claude/settings.json` by default. So does Copilot. A repository that ships both a Claude config and a native config for those agents gets every hook run twice.

For Cursor the harness handles it: Cursor's payload carries a `cursor_version` field, and when the Claude-dialect hook sees it in a project that also has the Cursor adapter, it stands down and lets the native adapter answer. A test pins this behaviour.

For Copilot there is no such marker in the payload. The hooks are safe to run twice (the guard gives the same verdict, and the stop gate does not rerun a verification that has just passed), but a failing stop gate can run its command twice. If that costs you, remove `copilot` from `agents` and let Copilot use the Claude config, or the reverse.

## How much of this is proven

| Agent | Status |
| --- | --- |
| Claude Code | Run end to end: a headless session with the installed hooks was refused `Read .env` and `cat .env`, and the secret never reached the transcript. |
| Cursor, Copilot, Codex | Tested against each vendor's documented payloads and reply formats, as subprocesses (`tests/hooks.test.mjs`). Not run inside the products. |
| Gemini CLI, OpenCode | Opt-in. Written to the documented contracts and covered by the same kind of test for Gemini. The OpenCode plugin has not been loaded by OpenCode. Gemini's hook command uses a path relative to the project root. |

When you enable an agent, do the one-minute check in [chapter 10](10-adopt.md): ask it to run `cat .env` and see what comes back.

## Windows

Most hook examples on the internet are bash scripts that pipe through `jq`. On Windows that means installing a shell and a tool before the guard works at all. Three choices here avoid the problem:

- **The hooks are Node scripts.** No `jq`, no bash. The engine has no dependencies.
- **No shell where one can be avoided.** Claude Code's exec form starts `node` directly, so there is nothing to quote.
- **No symlink where an import or a copy will do.** `CLAUDE.md` is an import. The skills folder falls back to a copy.

The shell reader also understands backslash paths and the PowerShell and `cmd` ways of listing the environment, and the test suite runs on Windows, macOS and Linux in CI.

## Add an agent

A new agent, or a changed format, touches two files.

1. **`lib/dialects.mjs`**: add its tool names to the sets at the top if they are new. Add a `case` to each reply function. If it cannot ask the user, leave it out of `canAsk`.
2. **`lib/sync.mjs`**: add a function that returns its hook configuration, and a block in `planSync` that writes the file. Add its name to `KNOWN_AGENTS`.
3. **`tests/hooks.test.mjs`**: add a test that feeds the guard the payload from the vendor's documentation and asserts the reply.

The policy, the sensors, the linter and every skill stay as they are.

Next: [keeping it honest](09-keeping-it-honest.md).
