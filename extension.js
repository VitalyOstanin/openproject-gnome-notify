// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { OpenProjectClient, TokenError, NotConfiguredError } from "./lib/api.js";
import { Poller } from "./lib/poller.js";
import { OpenProjectIndicator } from "./lib/indicator.js";
import { newUnreadIds, buildWorkPackageUrl } from "./lib/parse.js";

const INDICATOR_ROLE = "openproject-gnome-notify";

export default class OpenProjectNotifyExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._lastUnreadIds = [];
    this._source = null;
    this._enabled = true;
    // The first poll seeds the unread set; do not raise banners for items that
    // were already unread before the extension was enabled.
    this._firstPoll = true;

    this._client = new OpenProjectClient(this._settings.get_string("host"));

    this._indicator = new OpenProjectIndicator({
      onOpen: (n) => this._open(n),
      onToggleRead: (n) => this._toggleRead(n),
      onMarkAllRead: () => this._markAllRead(),
      onRefresh: () => this._poller.refreshNow(),
      onPrefs: () => this.openPreferences(),
    });
    Main.panel.addToStatusArea(INDICATOR_ROLE, this._indicator);

    this._poller = new Poller({
      intervalSec: this._settings.get_int("poll-interval"),
      onTick: () => this._poll(),
    });

    this._settingsIds = [
      this._settings.connect("changed::poll-interval", () =>
        this._poller.setInterval(this._settings.get_int("poll-interval")),
      ),
      this._settings.connect("changed::host", () => {
        this._client.destroy();
        this._client = new OpenProjectClient(this._settings.get_string("host"));
        this._poller.refreshNow();
      }),
      // Preferences bump this counter after writing the token to the keyring, so
      // the running extension reloads it without restarting.
      this._settings.connect("changed::token-revision", () => {
        this._client.reloadToken();
        this._poller.refreshNow();
      }),
    ];

    this._poller.start();
  }

  async _poll() {
    try {
      const notifications = await this._client.listNotifications();
      // The await may resolve after disable(); bail out if so.
      if (!this._enabled) return;
      this._indicator.setData(notifications, this._settings.get_int("max-items"));

      if (!this._firstPoll && this._settings.get_boolean("show-banner")) {
        const fresh = newUnreadIds(this._lastUnreadIds, notifications);
        if (fresh.length > 0)
          this._notify(notifications.filter((n) => fresh.includes(n.id)));
      }
      this._lastUnreadIds = notifications
        .filter((n) => !n.read)
        .map((n) => n.id);
      this._firstPoll = false;
    } catch (e) {
      if (!this._enabled) return;
      if (e instanceof NotConfiguredError) {
        // Host not configured yet: show a hint, stay quiet in the journal.
        this._indicator.setError("Set host in Settings");
      } else if (e instanceof TokenError) {
        this._indicator.setError(
          e.message === "unauthorized" ? "Invalid token" : "Set token in Settings",
        );
      } else {
        // Keep the last data and stay quiet; retry on the next tick.
        logError(e, "openproject-gnome-notify: poll failed");
      }
    }
  }

  _ensureSource() {
    if (this._source) return this._source;
    this._source = new MessageTray.Source({
      title: "OpenProject",
      iconName: "mail-unread-symbolic",
    });
    this._source.connect("destroy", () => {
      this._source = null;
    });
    Main.messageTray.add(this._source);
    return this._source;
  }

  _notify(items) {
    const source = this._ensureSource();
    const first = items[0];
    const single = items.length === 1;
    const notification = new MessageTray.Notification({
      source,
      title: single
        ? first.wpId
          ? `#${first.wpId} ${first.wpTitle}`
          : first.wpTitle
        : `${items.length} new notifications`,
      body: single ? `${first.reason} · ${first.project}` : "",
    });
    if (single)
      notification.connect("activated", () => this._open(first));
    source.addNotification(notification);
  }

  _open(n) {
    if (n.wpId) {
      const url = buildWorkPackageUrl(this._settings.get_string("host"), n.wpId);
      Gio.AppInfo.launch_default_for_uri(url, null);
    }
    this._client
      .markRead(n.id)
      .then(() => this._poller?.refreshNow())
      .catch((e) => logError(e, "openproject-gnome-notify: markRead failed"));
  }

  _toggleRead(n) {
    const p = n.read ? this._client.markUnread(n.id) : this._client.markRead(n.id);
    p.then(() => this._poller?.refreshNow()).catch((e) =>
      logError(e, "openproject-gnome-notify: toggle failed"),
    );
  }

  // Mark the unread ids from the last poll; no extra network round-trip.
  _markAllRead() {
    this._client
      .markAllRead(this._lastUnreadIds)
      .then(() => this._poller?.refreshNow())
      .catch((e) => logError(e, "openproject-gnome-notify: markAllRead failed"));
  }

  disable() {
    this._enabled = false;

    this._poller?.stop();
    this._poller = null;

    for (const id of this._settingsIds ?? []) this._settings.disconnect(id);
    this._settingsIds = null;

    this._client?.destroy();
    this._client = null;

    this._indicator?.destroy();
    this._indicator = null;

    this._source?.destroy();
    this._source = null;

    this._settings = null;
    this._lastUnreadIds = [];
  }
}
