# 4. Poll the REST API on a timer

## Status
Accepted

## Context
OpenProject in-app notifications have a REST collection. There is no readily
available push channel for this extension.

## Decision
Poll `GET /api/v3/notifications` on a GLib timer (default 120 s, configurable).
Overlapping ticks are skipped. New unread ids are diffed against the previous tick
to drive the optional banner. Network availability is not probed.

## Consequences
Notifications appear with up to one interval of latency. Failed requests keep the
last data and stay quiet until the next tick.
