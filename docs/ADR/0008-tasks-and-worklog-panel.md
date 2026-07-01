# 8. Second panel: my tasks and work-log status

## Status
Accepted

## Context
Beyond notifications, the author needs an at-a-glance view of the tasks they are
or were responsible for, and whether their logged hours keep up with an expected
plan since joining.

## Decision
Keep a single panel indicator with a single menu laid out in two columns:
notifications on the left, my tasks + work-log on the right. The panel icon colour
reflects unread notifications only; the work-log status is shown as a coloured
summary line at the bottom of the right column, never on the icon.

- Tasks: `openproject-cli wp list --assignee me --include-past`, which returns
  current plus previously-assigned work packages, newest-updated first.
  "Previously assigned" has no server-side filter, so the CLI accumulates the ids
  ever assigned in a local state file; this tracking is off unless `--include-past`
  is passed.
- Work-log: `openproject-cli time list --user me --since <start-date>`. The plan is
  8 hours per weekday (Mon-Fri, holidays ignored) from a configurable start date
  (`start-date`, default kept in GSettings). Status is computed per day: red if any
  previous day is under plan, yellow if only today is under plan, green if every
  day meets plan. The status colours the panel icon and the summary line.

## Consequences
- The task history only grows from first use; earlier assignments are not shown.
- The plan can be misleading around public holidays until a production calendar is
  added.
- The daily norm and working days are constants, not settings, to keep the UI
  minimal; they can become settings later.
