# TODO

- Notification instability: diagnose only if it persists after the move to
  openproject-cli (the CLI's retry/timeout transport may already resolve it).
- Assignee history only accumulates from first use of `wp list --include-past`;
  tasks assigned before that are not shown. A backfill (journal scan) is out of
  scope for now.
- Work-log plan ignores public holidays (8h per weekday, RU production calendar
  not applied). Revisit if the yellow/red status is misleading around holidays.
- Daily norm (8h) and working days (Mon-Fri) are constants; make them settings
  only if needed.
- `markAllRead` fires per-id requests in parallel; a bulk endpoint could replace
  it if confirmed available.
- The tasks panel opens a work package in the browser but does not mark anything;
  add per-row actions (status, log time) only if wanted.
