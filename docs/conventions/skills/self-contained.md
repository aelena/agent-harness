# Self-contained skills

## Rule

A skill folder works when it is installed alone. Its links stay inside the folder, its `SKILL.md` body stays under 300 lines, and detail that is needed only sometimes lives in `resources/` files that `SKILL.md` links to. When a skill needs another skill, it names it ("with the `git-commit` skill if it is installed") and says what to do when it is missing.

## Why

- Installers such as `npx skills add` copy single skill folders. A link to `../other-skill/` is broken on arrival.
- The body of a skill is loaded whole when the skill runs. Putting the GitHub and GitLab variants of a workflow into resource files means a run pays only for the variant it uses.
- One skill with resources replaces several near-copies. Upstream kept four copies of the same 6 KB guideline file in four planning skills, with nothing that kept them equal.

## Examples

### Good: one skill, variants read on demand

```markdown
| Input | Store | Also read |
| --- | --- | --- |
| A GitHub issue URL | GitHub issues | [`resources/store-github.md`](resources/store-github.md) |
| A GitLab issue URL | GitLab issues | [`resources/store-gitlab.md`](resources/store-gitlab.md) |
```

### Bad: a link that leaves the folder

```markdown
Follow the convention in [`commit-messages.md`](../git-commit/resources/commit-messages.md).
```

### Bad: a resource nothing points to

A file under `resources/` that `SKILL.md` never mentions is never read. It is dead weight that looks like documentation.

## Exceptions

- A reference to another skill by name is fine. Only file links must stay inside.

## Enforcement

`harness check`: `skill/self-contained`, `skill/broken-link`, `skill/size`, and `skill/orphan-resource` as a warning.

## See also

- [`.agents/skills/rpi-plan/`](../../../.agents/skills/rpi-plan/SKILL.md)
- [Skill frontmatter](frontmatter.md)
