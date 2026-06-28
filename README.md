# OpenProject Notifications

GNOME Shell extension (49–50) that shows OpenProject in-app notifications in the
top panel: an unread badge and a menu listing notifications. Each row is a
fixed-height summary (title, author and time, field changes, comment); the leading
dot toggles read/unread and a jump button opens the work package in the browser.
Activating a row (click or arrows + Enter) opens a modal window with the full,
formatted comment (markdown rendered from the server html — emphasis, headings,
quotes, lists, code and clickable links). The menu also has an explicit Refresh
and a mark-all-read action, with an optional desktop banner on new notifications.

## Install

1. Symlink or copy this directory to
   `~/.local/share/gnome-shell/extensions/openproject-gnome-notify@VitalyOstanin`.
2. Compile the schema: `glib-compile-schemas schemas/`.
3. Log out and back in (Wayland), then enable:
   `gnome-extensions enable openproject-gnome-notify@VitalyOstanin`.

## Configure

Open the extension preferences and set:

- **OpenProject base URL** — including any path prefix, e.g. `https://openproject.example.com`.
- **API token** — a personal API token; stored in the system keyring (libsecret).
- **Poll interval** — how often to fetch notifications (default 120 s).
- **Max notifications in menu** — default 15.
- **Show banner on new notifications** — off by default.

## License

GPL-2.0-or-later.
