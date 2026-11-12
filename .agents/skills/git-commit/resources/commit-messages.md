# Commit messages

## Format

```text
type[(scope)][!]: summary

[body]

[trailers]
```

- `type`: one of the types below.
- `scope`: optional, the area touched, when the repository's history uses scopes.
- `!`: the change breaks a public contract. Explain the break in the body.
- `summary`: imperative present tense ("add", not "added" or "adds"), lowercase first letter, no period, 72 characters at most.

## Types

Pick the most specific type that is true.

| Type | Use for |
| --- | --- |
| `feat` | A new capability for users. |
| `fix` | A bug fix. |
| `perf` | A change whose purpose is speed or resource use. |
| `refactor` | A change of structure with no change of behaviour. |
| `test` | Adding or correcting tests only. |
| `docs` | Documentation only, including plans and conventions. |
| `build` | Build system or dependencies. |
| `ci` | CI configuration and scripts. |
| `style` | Formatting only (not visual design, which is `feat` or `fix`). |
| `chore` | Maintenance that fits nothing above. |
| `revert` | Reverting an earlier commit. |

Prefer `perf` over `refactor` for a speed-up, `build` over `chore` for a dependency bump, `ci` over `build` for a workflow file.

## Body

Optional. Say **why** the change was made and what a reader could not get from the diff: the constraint, the alternative you rejected, the follow-up it leaves. Do not narrate the diff.

## Examples

Good:

```text
feat: add newsletter subscription page
fix: prevent duplicate license assignments
perf: lazy-load course card images
build: bump undici from 7.2.0 to 7.3.1
feat!: require an API version header
```

Bad:

```text
Added newsletter page            no type, past tense, capitalized
feat: Add newsletter page.       capitalized, trailing period
refactor: improve performance    the purpose is speed: use perf
fix: stuff                       says nothing
```
