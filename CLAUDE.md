# CLAUDE.md — openproject-gnome-notify

GNOME Shell extension. Conventions:

- English only: code, comments, README, ADR, commit messages.
- SPDX header on every source file: `// SPDX-License-Identifier: GPL-2.0-or-later`.
- ESM modules; entry point `export default class … extends Extension`.
- Pure, GNOME-free logic lives in `lib/parse.js`, `lib/timelog.js` and
  `lib/model.js` and is unit-tested under gjs (`tests/run.sh`). GNOME-coupled code
  (`lib/cli.js`, `lib/indicator.js`, `lib/poller.js`, `lib/dialog.js`,
  `lib/markup.js`, `extension.js`, `prefs.js`) is syntax-checked with `node --check`
  and verified at runtime.
- All OpenProject access goes through the external `openproject-cli` tool, run as
  a subprocess (`lib/cli.js`). The extension stores no host or API token itself;
  both come from the CLI configuration (`openproject-cli auth login`). Because it
  depends on an external binary, this build is not intended for extensions.gnome.org.
- Public repository; do NOT hardcode any instance host or mention any specific
  organisation.
- Supported GNOME: 49–50. Verify version-sensitive APIs against the local
  gnome-shell checkout (`~/devel/gnome`) on both branches.
- Each deliberate decision gets an ADR under `docs/ADR/`.
