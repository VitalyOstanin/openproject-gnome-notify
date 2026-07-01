// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { Cli, CliError } from "./lib/cli.js";
import { Poller } from "./lib/poller.js";
import { OpenProjectIndicator } from "./lib/indicator.js";
import { TasksIndicator } from "./lib/tasks-indicator.js";
import { NotificationDialog } from "./lib/dialog.js";
import { newUnreadIds, buildWorkPackageUrl, parseActivity } from "./lib/parse.js";
import { parseCliNotifications, parseTasks, parseTimeEntries } from "./lib/model.js";
import { computeTimelogStatus } from "./lib/timelog.js";

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

    this._cli = new Cli();
    this._host = "";
    // Activities (journals) are immutable, so cache them by href.
    this._activityCache = new Map();

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
    Main.panel.addToStatusArea(INDICATOR_ROLE, this._indicator, 0);

    this._tasksIndicator = new TasksIndicator({
      onOpen: (t) => this._openTask(t),
      onRefresh: () => this._poller.refreshNow(),
      onPrefs: () => this.openPreferences(),
    });
    // Placed to the right of the notifications indicator.
    Main.panel.addToStatusArea(`${INDICATOR_ROLE}-tasks`, this._tasksIndicator, 1);

    this._poller = new Poller({
      intervalSec: this._settings.get_int("poll-interval"),
      onTick: async () => {
        await this._poll();
        await this._pollTasks();
      },
    });

    this._settingsIds = [
      this._settings.connect("changed::poll-interval", () =>
        this._poller.setInterval(this._settings.get_int("poll-interval")),
      ),
      this._settings.connect("changed::start-date", () => this._poller.refreshNow()),
    ];

    this._poller.start();
  }

  async _ensureHost() {
    if (this._host) return this._host;
    const status = await this._cli.authStatus();
    this._host = (status && status.url) || "";
    return this._host;
  }

  _showCliError(indicator, e) {
    if (e instanceof CliError && e.kind === "spawn") {
      indicator.setError("Install openproject-cli");
    } else if (e instanceof CliError && e.kind === "auth") {
      indicator.setError("Run: openproject-cli auth login");
    } else {
      logError(e, "openproject-gnome-notify: CLI call failed");
    }
  }

  async _poll() {
    try {
      await this._ensureHost();
      const json = await this._cli.listNotifications();
      // The await may resolve after disable(); bail out if so.
      if (!this._enabled) return;
      const notifications = parseCliNotifications(json);
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
      this._showCliError(this._indicator, e);
    }
  }

  async _pollTasks() {
    try {
      await this._ensureHost();
      const startDate = this._settings.get_string("start-date");
      const [tasksJson, timeJson] = await Promise.all([
        this._cli.listMyTasks(),
        this._cli.listMyTime(startDate),
      ]);
      if (!this._enabled) return;
      const tasks = parseTasks(tasksJson);
      const entries = parseTimeEntries(timeJson);
      const timelog = computeTimelogStatus(entries, startDate, new Date());
      const maxItems = this._settings.get_int("max-items");
      this._tasksIndicator.setData(tasks, timelog, maxItems);
    } catch (e) {
      if (!this._enabled) return;
      this._showCliError(this._tasksIndicator, e);
    }
  }

  // Attach comment/field-change details to the items shown in the menu. Cached
  // by href because activities never change once created.
  async _enrichDetails(items) {
    for (const n of items) {
      if (!this._enabled || !n.activityHref) continue;
      try {
        if (this._activityCache.has(n.activityHref)) {
          n.detail = this._activityCache.get(n.activityHref);
          continue;
        }
        const json = await this._cli.getActivity(n.activityHref);
        n.detail = parseActivity(json);
        this._activityCache.set(n.activityHref, n.detail);
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
    if (n.wpId && this._host) {
      const url = buildWorkPackageUrl(this._host, n.wpId);
      Gio.AppInfo.launch_default_for_uri(url, null);
    }
    this._cli
      .markRead(n.id)
      .then(() => this._poller?.refreshNow())
      .catch((e) => logError(e, "openproject-gnome-notify: markRead failed"));
  }

  _openTask(t) {
    if (t.id && this._host) {
      const url = buildWorkPackageUrl(this._host, t.id);
      Gio.AppInfo.launch_default_for_uri(url, null);
    }
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

  _resolveHref(href) {
    if (!href) return "";
    if (/^https?:\/\//.test(href)) return href;
    const m = /^(https?:\/\/[^/]+)/.exec(this._host || "");
    const origin = m ? m[1] : "";
    return origin ? `${origin}${href}` : "";
  }

  _openUrl(url) {
    if (url) Gio.AppInfo.launch_default_for_uri(url, null);
  }

  _toggleRead(n) {
    const p = n.read ? this._cli.markUnread(n.id) : this._cli.markRead(n.id);
    p.then(() => this._poller?.refreshNow()).catch((e) =>
      logError(e, "openproject-gnome-notify: toggle failed"),
    );
  }

  // Mark the unread ids from the last poll; no extra network round-trip.
  _markAllRead() {
    Promise.all(this._lastUnreadIds.map((id) => this._cli.markRead(id)))
      .then(() => this._poller?.refreshNow())
      .catch((e) => logError(e, "openproject-gnome-notify: markAllRead failed"));
  }

  disable() {
    this._enabled = false;

    this._poller?.stop();
    this._poller = null;

    for (const id of this._settingsIds ?? []) this._settings.disconnect(id);
    this._settingsIds = null;

    this._cli = null;
    this._host = "";
    this._activityCache?.clear();
    this._activityCache = null;

    this._indicator?.destroy();
    this._indicator = null;

    this._tasksIndicator?.destroy();
    this._tasksIndicator = null;

    this._source?.destroy();
    this._source = null;

    this._settings = null;
    this._lastUnreadIds = [];
  }
}
