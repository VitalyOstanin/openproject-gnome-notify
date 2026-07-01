# 7. Access OpenProject through the openproject-cli subprocess

## Status
Accepted (supersedes [0001](0001-store-token-in-libsecret.md) and the host
mechanism of [0002](0002-public-generic-no-hardcoded-host.md))

## Context
The extension originally spoke to the OpenProject REST API directly over libsoup3
and kept its own host setting and libsecret token. A separate command-line tool,
openproject-cli, already implements the same API access with a hardened transport
(retries, timeouts, redirect/SSRF guards) and credential storage. Maintaining two
independent clients duplicates that logic, and the notification path was unstable.

## Decision
All OpenProject access goes through `openproject-cli`, launched as an async
subprocess (`Gio.Subprocess`, JSON on stdout) from `lib/cli.js`. The extension
keeps no host or token of its own: the host is read from `openproject-cli auth
status --offline`, and credentials live entirely in the CLI configuration
(`openproject-cli auth login`). The binary is invoked by name and resolved via the
shell PATH.

## Consequences
- One hardened client instead of two; the notification path reuses the CLI's
  retry/timeout transport.
- The extension depends on an external binary on PATH, so it is **not** suitable
  for extensions.gnome.org (which requires self-contained extensions). This build
  is a personal tool.
- Errors are surfaced by kind: a missing binary shows "Install openproject-cli",
  an unconfigured CLI shows a hint to run `auth login`.
- Each poll spawns a few short-lived subprocesses; acceptable at the default poll
  interval. Activity details are cached by href to avoid refetching.
