# 5. Open marks read; a per-row toggle controls read/unread

## Status
Accepted

## Context
Users want to open a work package and to control read state explicitly, including
marking back to unread.

## Decision
Activating a notification row opens the work package in the browser and marks it
read (`read_ian`). A trailing icon button toggles read/unread
(`read_ian`/`unread_ian`) without opening or closing the menu. A footer action
marks all fetched unread items read by iterating ids.

## Consequences
Mark-all cost is linear in unread count; a bulk endpoint can replace it later
(see TODO).
