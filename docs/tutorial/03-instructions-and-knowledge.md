# 3. Instructions and knowledge

The first part of a harness to build is the one the agent reads before anything else. It is also the part most often built badly, by writing too much.

## AGENTS.md is a map

`AGENTS.md` at the repository root is loaded into every session. That makes it the most valuable text in the harness and the most expensive: every line is paid for on every task, relevant or not, and every line competes with the others for the model's attention. Past a certain length, adding a rule makes the other rules work worse.

So the file has one job: let an agent that knows nothing find what it needs. It holds:

1. **What this project is**, in two sentences.
2. **The commands**: install, run, test, and the one command that verifies work. Exact, and working.
3. **The map**: which directory holds what.
4. **A short list of rules** that apply to almost every task and cannot be enforced by a tool.
5. **Pointers** to the convention docs, to be read when relevant.

It does not hold the conventions themselves, long explanations, or anything a linter could enforce.

This repository's own [`AGENTS.md`](../../AGENTS.md) is 43 lines, six of them generated. The starter is [`.agents/harness/templates/AGENTS.md`](../../.agents/harness/templates/AGENTS.md).

### What to leave out

| Tempting to add | Why not | Where it goes |
| --- | --- | --- |
| "Use 2-space indentation." | A formatter does this for free. | Formatter config. |
| The full testing guide. | Needed for one task in five. | `docs/conventions/testing/...`, linked from the map. |
| "IMPORTANT: NEVER edit the lockfile!!!" | Capitals mark a rule the agent kept breaking. Prose did not work, and louder prose will not either. | A guard rule ([chapter 5](05-guardrails.md)). |
| Your personal preferences. | They are not the project's. | Your user-level agent settings. |
| A paragraph on the project's history. | It does not change what the agent does. | Nowhere, or the README. |

A test for every line: *if this line were deleted, would the agent do worse on a typical task?* If not, delete it.

### Budget it

A limit that nobody checks is a wish. `harness check` fails when `AGENTS.md` passes `budgets.agentsMdLines` (default 120):

```text
error  AGENTS.md  [docs/agents-md-size]
       AGENTS.md is 200 lines; the budget is 120. It is loaded into every session.
       Keep it a map and move detail into docs/.
```

### One file, every agent

Cursor, Copilot, Codex and OpenCode read `AGENTS.md` natively. Two agents need a pointer, and `harness sync` writes both:

- **Claude Code** reads `CLAUDE.md`. Sync generates one whose only content is the import line `@AGENTS.md`. An import works on every operating system; the symlink that many repositories use needs extra setup on Windows.
- **Gemini CLI** reads `GEMINI.md` unless told otherwise. Sync adds `AGENTS.md` to `context.fileName` in `.gemini/settings.json`.

For a large repository, put an `AGENTS.md` in a subdirectory for rules that apply only there. Agents load it when they work in that directory, so the cost is paid only when it is relevant.

## Knowledge lives in the repository

An agent can use only what it can read. A decision made in a meeting, a convention everyone "just knows", an explanation in a chat thread: none of it exists for the agent. The fix is to treat the repository as the system of record: if it matters, it is a versioned file.

This harness keeps conventions under `docs/conventions/<area>/<rule>.md`, one rule per file. One per file because an agent can then load the single doc its task needs, and because each is reviewed alone in a pull request.

### The shape of a convention

Every convention has the same four required sections. `harness check` fails a doc that lacks one (`docs/convention-sections`).

````markdown
# Thin API routes

## Rule
A route handler parses the request, calls one application service, and maps the result to a response.

## Why
- Logic in a handler cannot be reused by a worker or a CLI, and is tested only through HTTP.

## Examples
### Good: the handler delegates
```ts
export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  return Response.json(await registerUser.run(body), { status: 201 });
}
```
### Bad: the handler decides
```ts
export async function POST(req: Request) {
  const body = await req.json();
  if (await db.user.findFirst({ where: { email: body.email } })) { ... }
}
```

## Enforcement
ESLint `no-restricted-imports`: files under `src/app/api/` may not import from `src/infrastructure/db`.
````

Three of these sections are common practice. The fourth, **Enforcement**, is the one that changes behaviour. It forces the question "what checks this?" for every rule you write down, and when the honest answer is "nothing", it says so:

```markdown
## Enforcement
Not automated: needs judgment in review.
```

Search your conventions for that line and you have the list of rules that depend on someone remembering them. That list is your backlog for [chapter 6](06-feedback-loops.md).

### The map is generated

A doc the map does not mention is never read. A map kept by hand goes stale: upstream's `AGENTS.md` listed `docs/documentation-format.md`, a file that does not exist. Here the list of conventions in `AGENTS.md` sits between two markers and is rewritten by `harness sync` from the files on disk:

```markdown
<!-- harness:docs:start -->
- `docs/conventions/hooks/policy-rules.md`: Policy rules
- `docs/conventions/skills/frontmatter.md`: Skill frontmatter
<!-- harness:docs:end -->
```

Broken links anywhere in the docs fail `harness check` (`docs/broken-link`).

## Corrections become conventions

Knowledge enters the repository at the moment you correct the agent. You say "no, we never use default exports", the agent fixes it, and unless something records it, the same correction is needed next week.

The `convention-capture` skill is that something. Run it after a correction and it:

1. extracts the rule, the reason, and a good and a bad example from the conversation (the agent's first attempt is the bad example, your correction the good one);
2. asks **how the rule can be enforced**, in order of preference: an existing tool setting, a small structural check, a test, a guard rule, and only last a doc alone;
3. builds the check, with a failure message that explains the fix, and writes the doc;
4. regenerates the map.

Step 2 is the point. The skill is built to move a rule out of the "inferred guide" cell and into the "computed sensor" cell whenever that is possible.

## Exercise

In a scratch repository:

1. Copy the `AGENTS.md` template and fill it in for a project you know. Keep it under 50 lines.
2. Write one convention doc for a rule your team actually has. Be honest in the Enforcement section.
3. Ask your agent to do a small task that the convention applies to, in a fresh session. Did it find and follow the doc? If not, is the pointer in the map clear enough?

Next: [skills and workflow](04-skills-and-workflow.md).
