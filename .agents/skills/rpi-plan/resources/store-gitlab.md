# Store a plan as GitLab issues

The issue whose URL was passed in (`https://<host>/<namespace>/<project>/-/issues/<iid>`) becomes the **parent plan issue**. Each phase becomes a **child issue**, linked to the parent as a related issue.

```
#12 Product bundles          parent: goal, context, decisions, phases checklist
  #13 Phase 1: ...           child: description, contracts, tests, task checkboxes
  #14 Phase 2: ...
```

## Before you start

- Let `glab` resolve the project from the local remote. Never hardcode one.
- Run `glab repo view` and check that the issue URL belongs to that project. If it does not, stop and ask the user to run the skill from a clone of the right project.
- Read the task with `glab issue view <parent-iid>`.

Create no issue until the user has approved the plan.

## Create the issues

1. Create one child issue per phase, in order, linked to the parent at creation:

   ```bash
   glab issue create --title "Phase N: <title>" --description "<body>" \
     --linked-issues <parent-iid> --link-type relates_to --yes
   ```

   A child body holds the phase description, its contracts, its tests, its tasks as checkboxes, and the line `Part of #<parent>`. As phases land through merge requests, the stop task asks for merge request titles instead of commit messages. Take the child IID from the URL `glab` prints.

   If `--linked-issues` is not available or the link fails, create the issue without it and link it afterwards:

   ```bash
   project_id="$(glab api projects/:id --jq .id)"
   glab api --method POST projects/:id/issues/<parent-iid>/links \
     -F target_project_id="$project_id" -F target_issue_iid=<child-iid>
   ```

2. Update the parent with `glab issue update <parent-iid> --description "<body>"`. Keep the original description untouched at the top, add a `---` line, and append: Goal, Context, Decisions, a `Phases` checklist with one `- [ ] #<child> Phase N: <title>` line per phase, and Next step.

3. End the parent body with the plan metadata, since issues have no frontmatter:

   ```markdown
   <sub>Planned with <tool> · <model> · <YYYY-MM-DDTHH:MM:SSZ></sub>
   ```

## What GitLab does not do for you

- It does not check a task-list item when the issue it refers to closes.
- Some instances have automatic issue closing turned off, so `Closes #<iid>` in a merged merge request leaves the issue open.

The implement step handles both: it checks the parent's phase items itself and closes issues explicitly once a merge is confirmed.

## Report

Give the user the parent URL and the child IIDs. The next step is `/rpi-implement <parent or child issue url>`.
