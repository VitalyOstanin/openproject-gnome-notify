# 3. Support GNOME 49–50

## Status
Accepted

## Context
The author's other extensions target 45–50, but this one is new and only needs
the currently used releases.

## Decision
Declare `shell-version` `["49", "50"]`. Verify version-sensitive APIs
(MessageTray Source/Notification, PanelMenu, libsoup3, Secret, Adw rows) against
the local gnome-shell checkout on both branches.

## Consequences
Smaller compatibility surface; if older releases are needed later, the range and
API checks must be widened.
