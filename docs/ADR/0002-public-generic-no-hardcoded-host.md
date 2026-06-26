# 2. Public, generic extension with no hardcoded host

## Status
Accepted

## Context
The extension is developed against a specific internal instance but the
repository is public. It must not leak that instance or any organisation name.

## Decision
The host is a user setting with no default; nothing in code, README, schema
defaults, or commit messages names a specific instance. The extension works
against any OpenProject instance.

## Consequences
Users must enter a host before the extension is functional; this is shown in the
menu ("Set token in Settings") and documented in the README.
