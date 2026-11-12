# Store a plan as GitHub issues

The issue whose URL was passed in becomes the **parent plan issue**. Each phase becomes a **child issue**, attached to the parent as a native sub-issue.

```
#12 Product bundles          parent: goal, context, decisions, phases checklist
  #13 Phase 1: ...           child: description, contracts, tests, task checkboxes
  #14 Phase 2: ...
```

## Before you start

- Let `gh` resolve the repository from the local remote. Never hardcode one.
- Run `gh repo view --json nameWithOwner --jq .nameWithOwner` and check that the issue URL belongs to that repository. If it does not, stop and ask the user to run the skill from a clone of the right repository.
- Read the task with `gh issue view <parent>`.

Create no issue until the user has approved the plan.

## Create the issues

1. Create one child issue per phase, in order. Write each body to a temporary file and pass it with `--body-file`, so quotes and backticks survive the shell:

   ```bash
   gh issue create --title "Phase N: <title>" --body-file <file>
   ```

   A child body holds the phase description, its contracts, its tests, its tasks as checkboxes, and the line `Part of #<parent>`. As phases land through pull requests, the stop task asks for pull request titles instead of commit messages.

2. Attach every child to the parent as a sub-issue. The API takes the child's database id, not its number:

   ```bash
   child_id=$(gh api repos/{owner}/{repo}/issues/<child> --jq .id)
   gh api --method POST repos/{owner}/{repo}/issues/<parent>/sub_issues -F sub_issue_id="$child_id"
   ```

   `gh` fills in `{owner}` and `{repo}` itself.

3. Update the parent with `gh issue edit <parent> --body-file <file>`. Keep the original description untouched at the top, add a `---` line, and append: Goal, Context, Decisions, a `Phases` checklist with one `- [ ] #<child> Phase N: <title>` line per phase, and Next step.

4. End the parent body with the plan metadata, since issues have no frontmatter:

   ```markdown
   <sub>Planned with <tool> · <model> · <YYYY-MM-DDTHH:MM:SSZ></sub>
   ```

## Report

Give the user the parent URL and the child numbers. The next step is `/rpi-implement <parent or child issue url>`.
