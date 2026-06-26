# 1. Store the API token in libsecret

## Status
Accepted

## Context
The OpenProject API token grants full access to the account. GSettings (dconf) is
stored in plaintext and is dumpable; the repository is public.

## Decision
Store the token in the system keyring via libsecret, keyed by a Secret schema with
a `service` attribute. GSettings keeps only non-secret settings.

## Consequences
The token never appears in dconf, files, or the repository. Lookup is synchronous
and cached in the client; an extra dependency (Secret-1) is required (present on
the supported systems).
