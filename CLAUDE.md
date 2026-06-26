# CLAUDE.md — openproject-gnome-notify

GNOME Shell extension. Conventions:

- English only: code, comments, README, ADR, commit messages.
- SPDX header on every source file: `// SPDX-License-Identifier: GPL-2.0-or-later`.
- ESM modules; entry point `export default class … extends Extension`.
- Pure, GNOME-free logic lives in `lib/parse.js` and is unit-tested under gjs
  (`tests/run.sh`). GNOME-coupled code (`lib/api.js`, `lib/indicator.js`,
  `lib/poller.js`, `lib/secrets.js`, `extension.js`, `prefs.js`) is syntax-checked
  with `node --check` and verified at runtime.
- Public repository; do NOT hardcode any instance host or mention any specific
  organisation. The host is a user setting with no default.
- The API token is stored in libsecret, never in GSettings or files.
- Supported GNOME: 49–50. Verify version-sensitive APIs against the local
  gnome-shell checkout (`~/devel/gnome`) on both branches.
- Each deliberate decision gets an ADR under `docs/ADR/`.
