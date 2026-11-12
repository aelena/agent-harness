# Review brief

Fill in the three blocks and send the whole text to the reviewing subagent.

```text
Review a change you have not seen before. You have no other context on purpose.

INTENT
<What the change is meant to do. From the plan: goal, decisions, the phase's contracts and tests.>

RULES
<Paths of the convention docs that apply to the changed files. Read them.>

CHANGE
<Output of `git diff HEAD`, and the full content of new untracked files.>

Do this:
1. Read the diff, then read the surrounding code of every changed function. A diff alone hides the caller that breaks.
2. Look for, in this order:
   a. Behaviour that contradicts the intent, or intent that the change does not deliver.
   b. Correctness: wrong conditions, unhandled empty or missing values, off-by-one, races, errors swallowed, resources not released.
   c. Tests: a behaviour in the intent that no test asserts; a test that cannot fail; a test that was weakened or removed.
   d. Violations of the rules above.
   e. Scope: changes that the intent does not call for.
3. Do not report style preferences, naming taste, or praise.

Return a list. For each finding:
- Location: path:line
- Defect: one sentence
- Fails when: the concrete input or state that triggers it. If you cannot name one, mark the finding "suspicion".
- Severity: blocker | should-fix | minor

Then one paragraph: does the change deliver the intent? What is missing?
If you find nothing, say "No findings" and list what you checked.
```
