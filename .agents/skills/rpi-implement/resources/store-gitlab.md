# Implement a phase stored as a GitLab issue

The plan is a parent issue with one linked child issue per phase. Each phase lands through its own merge request.

## Before you start

- Let `glab` resolve the project from the local remote. Run `glab repo view` and check that the issue URL belongs to it. If it does not, stop: the branch must be created in the project you implement in.

## Find the phase

Read the issue with `glab issue view <iid>`.

- It has a `Part of #<parent>` line and task checkboxes: it is a phase issue. Implement it.
- It has a `Phases` checklist of child issues: it is the parent. The current phase is the first child in that list that is still open. Read that child.
- Every child is closed: the plan is complete. Stop.

## Reconcile first

Some GitLab instances have automatic issue closing turned off, so a merged merge request can leave its issue open. Before implementing, close what is already merged:

```bash
glab mr list --merged --output json    # a phase's branch name starts with "<child-iid>-"
glab issue close <stale-child-iid>
```

Check the matching `- [ ] #<child>` items in the parent's `Phases` list while you are there.

## Differences from the file flow

1. **Branch first.** GitLab links a branch to an issue by its name, so start the name with the phase IID:

   ```bash
   git checkout -b <phase-iid>-<phase-name-in-kebab-case>
   ```

2. **Progress lives in the issue.** Check completed tasks in the phase issue with `glab issue update <phase-iid> --description "<body>"`. Update `Next step` in the parent the same way.

3. **Titles, not commit messages.** At the stop, suggest three merge request titles in Conventional Commit form.

4. **After the user picks a title**, and only then: commit, push the branch, and open the merge request.

   ```bash
   glab mr create --title "<chosen title>" --description "Closes #<phase-iid>" \
     --source-branch "<branch>" --yes
   ```

   On the last phase, add a second line, `Closes #<parent-iid>`.

5. **Check the phase in the parent yourself.** GitLab does not check task-list items when an issue closes: turn `- [ ] #<phase-iid>` into `- [x] #<phase-iid>` in the parent body.

6. **Never merge.** Ask the user to merge and to tell you when it is done. When they confirm, look at the phase issue: if it is still open, close it with `glab issue close <phase-iid>` (and the parent, on the last phase). If they do not confirm now, the reconcile step of the next run handles it.
