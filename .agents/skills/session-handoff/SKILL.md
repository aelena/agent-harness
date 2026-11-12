---
name: session-handoff
description: Write a handoff note that lets a fresh session continue this work with no other context - goal, state, decisions, dead ends, next step. Use when the conversation is getting long, before clearing or compacting context, when stopping work for the day, or when the user asks to save where things are.
disable-model-invocation: false
license: MIT
metadata:
  group: harness
  version: "1.0"
---

# Hand off the session

A long session gets worse as it goes: early details blur, and an automatic summary keeps what was said, not what matters. A note written on purpose, followed by a fresh session, beats both. This skill writes that note.

The reader is a new session that knows nothing. Everything it needs is in the note or in a file the note points to.

## Steps

### 1. Establish the facts

Do not write from memory alone. Check:

- `git status --short` and `git diff --stat`: what is actually changed and uncommitted.
- The plan in progress, if any (under `.agents/plans/`): which boxes are really checked.
- The last verification run: did it pass, and was that before or after the latest edits?

### 2. Write the note

Write `.agents/handoff.md`, replacing any earlier note, in this shape:

```markdown
# Handoff: <the task in a few words>

Written: <YYYY-MM-DD HH:MM> · Branch: <branch> · Last commit: <short hash>

## Goal

<What the user wants, in their terms. Two sentences.>

## State

- Done: <what is finished and verified>
- In progress: <what is half done, and exactly where it stops: file and function>
- Not started: <what remains>
- Verification: <the command, and whether it passes right now>

## Decisions

- <A choice that was made, and why. Include the ones the user made.>

## Dead ends

- <What was tried and did not work, and why. This saves the next session from repeating it.>

## Next step

<The single next action, concrete enough to start without thinking: the file to open, the command to run.>

## Pointers

- <Plan, research file, issue, the three files that matter most.>
```

Rules:

- **State facts, not the story.** Leave out how the session went.
- **Uncommitted work is named file by file.** It is the part most easily lost.
- **Keep what the user said in their words** where it constrains the work: preferences, things they ruled out.
- **Leave out anything the repository already says.** Point to the file instead.
- 60 lines at most.

### 3. Tell the user

Say that the note is written, and what to do: start a fresh session (in Claude Code, `/clear`) and it will be told about the note at the start. If the project does not use the harness hooks, the user can open the new session with: "Read `.agents/handoff.md` and continue."

## Boundaries

- The note is local working memory. It is ignored by git on purpose: do not commit it.
- Do not use the note to record conventions. Those belong in docs, through the `convention-capture` skill.
- When the work is finished and committed, delete the note so that no later session picks up a stale one.
