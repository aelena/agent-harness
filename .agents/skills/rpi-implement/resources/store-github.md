# Implement a phase stored as a GitHub issue

The plan is a parent issue with one child issue per phase. Each phase lands through its own pull request.

## Before you start

- Let `gh` resolve the repository from the local remote. Run `gh repo view --json nameWithOwner --jq .nameWithOwner` and check that the issue URL belongs to it. If it does not, stop: the branch must be created in the repository you implement in.

## Find the phase

Read the issue with `gh issue view <number>`.

- It has a `Part of #<parent>` line and task checkboxes: it is a phase issue. Implement it.
- It has a `Phases` checklist of child issues: it is the parent. The current phase is the first child in that list that is still open. Read that child.
- Every child is closed: the plan is complete. Stop.

## Differences from the file flow

1. **Branch first.** Before any change, create the branch linked to the phase issue:

   ```bash
   gh issue develop <phase-number> --checkout
   ```

2. **Progress lives in the issue.** Check completed tasks in the phase issue body with `gh issue edit <phase-number> --body-file <file>`. Update `Next step` in the parent the same way.

3. **Titles, not commit messages.** At the stop, suggest three pull request titles in Conventional Commit form.

4. **After the user picks a title**, and only then: commit, push the branch, and open the pull request.

   ```bash
   gh pr create --title "<chosen title>" --body "Closes #<phase-number>"
   ```

   On the last phase, add a second line, `Closes #<parent-number>`, so merging closes the whole plan.

5. **Never merge.** Tell the user that merging the pull request closes the phase issue.
