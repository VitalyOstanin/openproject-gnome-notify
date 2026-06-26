// SPDX-License-Identifier: GPL-2.0-or-later

import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";

import { countUnread, formatTimestamp } from "./parse.js";

const ICON_UNREAD = "mail-unread-symbolic";
const ICON_READ = "mail-read-symbolic";

export const OpenProjectIndicator = GObject.registerClass(
  class OpenProjectIndicator extends PanelMenu.Button {
    _init(callbacks) {
      super._init(0.5, "OpenProject Notifications");
      this._callbacks = callbacks;

      const box = new St.BoxLayout({ style_class: "panel-status-menu-box" });
      this._icon = new St.Icon({
        icon_name: ICON_READ,
        style_class: "system-status-icon",
      });
      this._badge = new St.Label({
        style_class: "opn-badge",
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
      });
      box.add_child(this._icon);
      box.add_child(this._badge);
      this.add_child(box);

      this._buildMenu([], 15);
    }

    setData(notifications, maxItems) {
      const unread = countUnread(notifications);
      this._badge.text = String(unread);
      this._badge.visible = unread > 0;
      this._icon.icon_name = unread > 0 ? ICON_UNREAD : ICON_READ;
      this._buildMenu(notifications, maxItems);
    }

    setError(message) {
      this.menu.removeAll();
      this._addHeader(0);
      this.menu.addMenuItem(
        new PopupMenu.PopupMenuItem(message, { reactive: false }),
      );
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this._addFooter();
      this._badge.visible = false;
      this._icon.icon_name = ICON_READ;
    }

    _buildMenu(notifications, maxItems) {
      this.menu.removeAll();
      this._addHeader(notifications.length);

      const shown = notifications.slice(0, maxItems);
      if (shown.length === 0) {
        this.menu.addMenuItem(
          new PopupMenu.PopupMenuItem("No notifications", { reactive: false }),
        );
      }
      for (const n of shown) this.menu.addMenuItem(this._notificationItem(n));

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this._addFooter();
    }

    _addHeader(count) {
      const header = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
      });
      const title = new St.Label({
        text: `OpenProject (${count})`,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      const refresh = new St.Button({
        child: new St.Icon({
          icon_name: "view-refresh-symbolic",
          style_class: "popup-menu-icon",
        }),
        style_class: "opn-icon-button",
        y_align: Clutter.ActorAlign.CENTER,
      });
      refresh.connect("clicked", () => this._callbacks.onRefresh());
      header.add_child(title);
      header.add_child(refresh);
      this.menu.addMenuItem(header);
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _notificationItem(n) {
      const item = new PopupMenu.PopupBaseMenuItem();

      const dot = new St.Label({
        text: n.read ? "○" : "●",
        style_class: n.read ? "opn-dot opn-dot-read" : "opn-dot opn-dot-unread",
        y_align: Clutter.ActorAlign.CENTER,
      });

      const labelBox = new St.BoxLayout({ vertical: true, x_expand: true });
      labelBox.add_child(
        new St.Label({
          text: `#${n.wpId} ${n.wpTitle}`,
          style_class: "opn-subject",
        }),
      );
      labelBox.add_child(
        new St.Label({
          text: `${n.reason} · ${n.project} · ${formatTimestamp(n.createdAt)}`,
          style_class: "opn-sub",
        }),
      );

      const toggle = new St.Button({
        child: new St.Icon({
          icon_name: n.read ? "mail-unread-symbolic" : "mail-read-symbolic",
          style_class: "popup-menu-icon",
        }),
        style_class: "opn-icon-button",
        y_align: Clutter.ActorAlign.CENTER,
      });
      // The button consumes its own click, so toggling read state does not also
      // activate the row (which would open the work package and close the menu).
      toggle.connect("clicked", () => this._callbacks.onToggleRead(n));

      item.add_child(dot);
      item.add_child(labelBox);
      item.add_child(toggle);
      item.connect("activate", () =>
        this._closeMenuThen(() => this._callbacks.onOpen(n)),
      );
      return item;
    }

    _addFooter() {
      const markAll = new PopupMenu.PopupMenuItem("Mark all as read");
      markAll.connect("activate", () =>
        this._closeMenuThen(() => this._callbacks.onMarkAllRead()),
      );
      this.menu.addMenuItem(markAll);

      const refresh = new PopupMenu.PopupMenuItem("Refresh");
      refresh.connect("activate", () =>
        this._closeMenuThen(() => this._callbacks.onRefresh()),
      );
      this.menu.addMenuItem(refresh);

      const prefs = new PopupMenu.PopupMenuItem("Settings");
      prefs.connect("activate", () =>
        this._closeMenuThen(() => this._callbacks.onPrefs()),
      );
      this.menu.addMenuItem(prefs);
    }

    // Actions rebuild the menu, which destroys the activated item mid-emission
    // and strips the AFTER auto-close handler; close the menu explicitly first.
    _closeMenuThen(action) {
      this.menu.close(BoxPointer.PopupAnimation.FULL);
      action();
    }
  },
);
