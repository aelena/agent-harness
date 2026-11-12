# Research format

## Report contract

Send this to every exploration subagent, together with its questions and its area:

```text
Answer each question about <area> with facts from the code. Do not suggest changes.

For each question return:
- Answer: one to three sentences.
- Evidence: path:line for the code that shows it.
- Tests: path:line of the tests that assert it, or "none".
- Surprises: anything that contradicts the docs, the tests, or the rest of the code. "none" if all agrees.

Also return:
- Entry points: the files someone must read first to work in this area, most important first, five at most.
- Conventions: patterns this area follows that new code must copy, each with one path:line example.

Return findings only. No file dumps, no summaries of files you only skimmed.
```

## File template

```markdown
---
task: "<the task or question, as the user gave it>"
created_at: "<YYYY-MM-DDTHH:MM:SSZ>"
commit: "<git rev-parse --short HEAD, or 'none'>"
---

# Research: <title>

## Summary

<Three to five sentences: how this area works today.>

## Findings

### <Question 1>

<Answer.> (`src/orders/total.ts:42`)

- Tests: `tests/orders/total.test.ts:10`

### <Question 2>

...

## Entry points

- `path/to/file.ts`: <why to read it first>

## Conventions to follow

- <Pattern>: see `path:line`

## Surprises

- <Contradiction, with both sources.>

## Open questions

- <What the code could not answer and the user must decide.>
```

## Rules

- The `commit` field tells a later reader how stale the research is. Research older than the code it describes must be redone, not trusted.
- Write paths relative to the repository root.
- Leave out a section that would be empty, except `Open questions`: write "None." there so the reader knows you looked.
