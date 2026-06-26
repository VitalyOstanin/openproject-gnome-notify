// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from "gi://GLib";

export class Poller {
  constructor({ intervalSec, onTick }) {
    this._intervalSec = intervalSec;
    this._onTick = onTick;
    this._sourceId = 0;
    this._running = false;
  }

  start() {
    if (this._sourceId) return;
    this._tick();
    this._sourceId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      this._intervalSec,
      () => {
        this._tick();
        return GLib.SOURCE_CONTINUE;
      },
    );
    GLib.Source.set_name_by_id(this._sourceId, "[openproject-gnome-notify] poll");
  }

  refreshNow() {
    this._tick();
  }

  setInterval(intervalSec) {
    this._intervalSec = intervalSec;
    if (this._sourceId) {
      this.stop();
      this.start();
    }
  }

  // Skip overlapping ticks: an in-flight async fetch must finish before the next
  // starts, so a slow request never stacks up behind the timer.
  _tick() {
    if (this._running) return;
    this._running = true;
    Promise.resolve()
      .then(() => this._onTick())
      .catch((e) =>
        logError(e, "openproject-gnome-notify: poll tick failed"),
      )
      .finally(() => {
        this._running = false;
      });
  }

  stop() {
    if (this._sourceId) {
      GLib.source_remove(this._sourceId);
      this._sourceId = 0;
    }
  }
}
