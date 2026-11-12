# agent-harness

A portable harness for coding agents: shared skills and subagents, one guard policy for every agent, feedback sensors, and the tooling that keeps all of it consistent. Zero dependencies, Node 20 or newer.

## Commands

```bash
npm run verify    # check + tests + policy evals. Must pass before any work is called done.
npm run check     # lint the harness: skills, docs, links, config, generated files
npm test          # node --test (finds tests/*.test.mjs)
npm run sync      # regenerate every agent's wiring after changing .agents/ or this file
```

## Map

- `.agents/harness/`: the engine. `cli.mjs`, `lib/` (policy, shell reader, dialects, sync, check, sensors), `hooks/` (the four entry points), `templates/`.
- `.agents/harness.json`: this repository's configuration: agents, sensors, policy overrides.
- `.agents/skills/`, `.agents/agents/`: the skills and subagents. This is the only copy to edit.
- `docs/tutorial/`: how a harness works and how to build one. `docs/conventions/`: the rules of this repository.
- `evals/`: recorded cases for the guard policy and for skill triggering. `tests/`: unit and integration tests.
- `plugins/`, `.claude-plugin/`, `openspec/`: distribution as Claude Code plugins, and the OpenSpec schema.

Generated, never edit by hand: `CLAUDE.md`, `.claude/`, `.cursor/hooks.json`, `.github/hooks/harness.json`, `.codex/hooks.json`, `.gemini/settings.json`, `.opencode/plugins/`, `skills.sh.json`, the `skills`, `agents` and `hooks` fields of `.claude-plugin/plugin.json`, and the blocks between `harness:` markers in this file and in `README.md`.

## Rules

- No runtime dependencies. The engine must run with nothing but Node, on Windows, macOS and Linux.
- A change to the policy comes with scenarios in `evals/policy.jsonl`: one that must be blocked and a near-miss that must pass.
- Agent-specific knowledge lives only in `lib/dialects.mjs` (payloads and replies) and `lib/sync.mjs` (config files). The policy and the sensors never mention an agent.
- Every message the harness prints for an agent is an instruction: what is wrong, why, what to do instead.
- A hook never crashes the agent. On an internal error it reports on stderr and answers "no opinion".

## Conventions

Read only the ones that apply to your task.

<!-- harness:docs:start -->
- `docs/conventions/harness/generated-files.md`: Generated files
- `docs/conventions/hooks/messages-are-instructions.md`: Messages are instructions
- `docs/conventions/hooks/policy-rules.md`: Policy rules
- `docs/conventions/skills/frontmatter.md`: Skill frontmatter
- `docs/conventions/skills/self-contained.md`: Self-contained skills
<!-- harness:docs:end -->
