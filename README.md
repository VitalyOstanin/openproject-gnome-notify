# OpenProject Notifications

GNOME Shell extension (49–50): a single top-panel indicator for OpenProject,
backed by the [openproject-cli](https://github.com/VitalyOstanin/openproject-cli)
tool. Its menu has two columns.

- **Left — notifications.** An unread badge on the panel icon and a list of in-app
  notifications. Each row is a fixed-height summary (title, author and time, field
  changes, comment); the leading dot toggles read/unread and a jump button opens the
  work package in the browser. Activating a row opens a modal window with the full,
  formatted comment (markdown rendered from the server html). Shared Refresh and
  mark-all-read actions, with an optional desktop banner on new notifications.
- **Right — my tasks and work-log.** A scrollable list of the tasks you are or were
  assigned to (newest-updated first), and a summary line of logged vs planned hours
  since your start date. The plan is 8 hours per weekday (Mon–Fri). The summary is
  coloured green (all logged), yellow (only today is behind) or red (an earlier day
  is behind).

The **panel icon colour reflects unread notifications only** (red = unread,
green = none); the work-log status colour is shown inside the menu, not on the icon.

The extension makes no API calls of its own: everything goes through
`openproject-cli`, run as a subprocess. Because it depends on that external
binary, this build is a personal tool and is not published on extensions.gnome.org.

## Requirements

- `openproject-cli` on your `PATH`, configured once:
  `openproject-cli auth login --url https://openproject.example.com`.

## Install

1. Symlink or copy this directory to
   `~/.local/share/gnome-shell/extensions/openproject-gnome-notify@VitalyOstanin`.
2. Compile the schema: `glib-compile-schemas schemas/`.
3. Log out and back in (Wayland), then enable:
   `gnome-extensions enable openproject-gnome-notify@VitalyOstanin`.

## Configure

Connection (host and token) is configured in `openproject-cli`, not here. The
extension preferences only hold:

- **Employment start date** (`YYYY-MM-DD`) — the date the work-log plan is counted
  from (default `2026-06-22`).
- **Poll interval** — how often to refresh (default 120 s).
- **Max rows in menus** — default 15.
- **Show banner on new notifications** — off by default.

## Development

- `bash tests/run.sh` runs the gjs unit tests for the pure helpers
  (`lib/parse.js`, `lib/timelog.js`, `lib/model.js`).
- GNOME-coupled files are syntax-checked with `node --check`.

## License

GPL-2.0-or-later.
