# Convention format

One convention per file, in the folder for its area: `docs/conventions/<area>/<rule-in-kebab-case>.md`.

A convention doc is read by an agent that has just been pointed at it and knows nothing else. It must stand alone.

## Template

````markdown
# <Name of the convention>

## Rule

<The rule, in one to three sentences. State what to do, not what to avoid.>

## Why

- <The problem this prevents, concretely.>

## Examples

### Good: <what makes it good>

```<language>
<the shortest example that shows the rule>
```

### Bad: <what is wrong with it>

```<language>
<the mistake as it is actually made>
```

## Exceptions

- <Where the rule does not apply.> Remove this section if there are none.

## Enforcement

<How the rule is checked: the lint rule, the test, the check id, the hook. Or: "Not automated: needs judgment in review.">

## See also

- <Links to real files that follow the rule, and to related conventions.>
````

## Rules for writing one

- **Rule, Why, Examples and Enforcement are required.** The harness check fails a convention that lacks one of them.
- **The rule comes first.** A reader who stops after the first section must still know what to do.
- **Examples carry the doc.** Use real code from the repository, cut down. A bad example must be a mistake someone actually made, not a strawman.
- **Enforcement is honest.** If nothing checks the rule, say so. That line is the list of rules that depend on people remembering.
- **Short.** If it passes 80 lines it is probably two conventions.
- **Link, do not repeat.** Refer to a related convention by link instead of restating it.
