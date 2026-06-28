// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { OpenProjectClient, TokenError, NotConfiguredError } from "./lib/api.js";
import { Poller } from "./lib/poller.js";
import { OpenProjectIndicator } from "./lib/indicator.js";
import { NotificationDialog } from "./lib/dialog.js";
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

    this._indicator = new OpenProjectIndicator(
      {
        onOpen: (n) => this._open(n),
        onToggleRead: (n) => this._toggleRead(n),
        onMarkAllRead: () => this._markAllRead(),
        onRefresh: () => this._poller.refreshNow(),
        onPrefs: () => this.openPreferences(),
        onShowDetail: (n) => this._showDetail(n),
      },
      `${this.path}/icons`,
    );
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
      const maxItems = this._settings.get_int("max-items");
      await this._enrichDetails(notifications.slice(0, maxItems));
      if (!this._enabled) return;
      this._indicator.setData(notifications, maxItems);

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

  // Attach comment/field-change details to the items shown in the menu. Sequential
  // and cached in the client, so steady-state polls fetch only new activities.
  async _enrichDetails(items) {
    for (const n of items) {
      if (!this._enabled || !n.activityHref) continue;
      try {
        n.detail = await this._client.getActivity(n.activityHref);
      } catch (_e) {
        n.detail = null;
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

  // Open the full-content modal for a notification. Inline links resolve against
  // the host origin; the main button reuses _open (which also marks read).
  _showDetail(n) {
    // Opening a modal dialog drops the panel menu's grab, so the menu closes.
    // Reopen it when the dialog is dismissed via Escape/Close, giving a "back to
    // the menu" step; navigating to the browser leaves the menu closed.
    const menu = this._indicator.menu;
    const dialog = new NotificationDialog(n, {
      onOpen: (item) => this._open(item),
      openUrl: (url) => this._openUrl(url),
      resolveHref: (href) => this._resolveHref(href),
      onClose: () => menu.open(),
    });
    dialog.open();
  }

  // Scheme + authority of the configured host, to resolve root-relative hrefs
  // (e.g. "/openproject/users/30") the comment html returns.
  _origin() {
    const host = this._settings.get_string("host").replace(/\/+$/, "");
    const m = /^(https?:\/\/[^/]+)/.exec(host);
    return m ? m[1] : "";
  }

  _resolveHref(href) {
    if (!href) return "";
    if (/^https?:\/\//.test(href)) return href;
    const origin = this._origin();
    return origin ? `${origin}${href}` : "";
  }

  _openUrl(url) {
    if (url) Gio.AppInfo.launch_default_for_uri(url, null);
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
