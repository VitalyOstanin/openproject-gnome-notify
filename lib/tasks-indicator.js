// SPDX-License-Identifier: GPL-2.0-or-later

import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import { ensureActorVisibleInScrollView } from "resource:///org/gnome/shell/misc/animationUtils.js";

import { formatTimestamp } from "./parse.js";

const PANEL_ICON = "view-list-symbolic";

const STATUS_CLASS = {
  red: "opn-status-red",
  yellow: "opn-status-yellow",
  green: "opn-status-green",
};

export const TasksIndicator = GObject.registerClass(
  class TasksIndicator extends PanelMenu.Button {
    _init(callbacks) {
      super._init(0.5, "OpenProject Tasks");
      this._callbacks = callbacks;

      const box = new St.BoxLayout({ style_class: "panel-status-menu-box" });
      this._icon = new St.Icon({
        icon_name: PANEL_ICON,
        style_class: "system-status-icon opn-status-green",
      });
      this._badge = new St.Label({
        style_class: "opn-badge",
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
      });
      box.add_child(this._icon);
      box.add_child(this._badge);
      this.add_child(box);

      this._build([], { logged: 0, planned: 0, todayDeficit: 0, status: "green" }, 15);
    }

    // tasks: [{id, subject, status, updatedAt}]; timelog from computeTimelogStatus.
    setData(tasks, timelog, maxItems) {
      this._setIconState(timelog.status);
      this._badge.text = timelog.status === "green" ? "" : `-${this._deficitHours(timelog)}h`;
      this._badge.visible = timelog.status !== "green";
      this._build(tasks, timelog, maxItems);
    }

    setError(message) {
      this._clearList();
      this.menu.removeAll();
      this.menu.addMenuItem(new PopupMenu.PopupMenuItem(message, { reactive: false }));
      this._setIconState("error");
      this._badge.visible = false;
    }

    _deficitHours(timelog) {
      // Yellow: today's shortfall; red: the summed per-day shortfall (overlog on
      // one day never offsets another day's deficit).
      const n = timelog.status === "yellow" ? timelog.todayDeficit : timelog.deficit;
      return Number.isInteger(n) ? String(n) : n.toFixed(1);
    }

    _setIconState(status) {
      const cls = STATUS_CLASS[status] || "";
      this._icon.style_class = `system-status-icon ${cls}`.trim();
    }

    _build(tasks, timelog, maxItems) {
      this._clearList();
      this.menu.removeAll();

      const section = new PopupMenu.PopupMenuSection();
      const shown = tasks.slice(0, maxItems);
      if (shown.length === 0)
        section.addMenuItem(new PopupMenu.PopupMenuItem("No tasks", { reactive: false }));
      for (const t of shown) section.addMenuItem(this._taskItem(t));

      this._listScroll = new St.ScrollView({
        style_class: "opn-list-scroll vfade",
        x_expand: true,
        overlay_scrollbars: false,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        child: section.actor,
      });
      this.menu.box.add_child(this._listScroll);

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this._addFooter(timelog);
    }

    _clearList() {
      if (this._listScroll) {
        this._listScroll.destroy();
        this._listScroll = null;
      }
    }

    _taskItem(t) {
      const item = new PopupMenu.PopupBaseMenuItem({ style_class: "opn-item" });
      const labelBox = new St.BoxLayout({ vertical: true, x_expand: true, style_class: "opn-item-lines" });

      const titleText = t.id ? `#${t.id} ${t.subject}` : t.subject;
      const title = new St.Label({ text: titleText, style_class: "opn-subject" });
      title.clutter_text.single_line_mode = true;
      title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
      labelBox.add_child(title);

      const metaText = [t.status, formatTimestamp(t.updatedAt)].filter(Boolean).join(" · ");
      const meta = new St.Label({ text: metaText || " ", style_class: "opn-sub" });
      meta.clutter_text.single_line_mode = true;
      meta.clutter_text.ellipsize = Pango.EllipsizeMode.END;
      labelBox.add_child(meta);

      item.add_child(labelBox);
      // Activating a row (click or arrows + Enter) closes the menu by default and
      // opens the task in the browser.
      item.connect("activate", () => this._callbacks.onOpen(t));
      item.connect("key-focus-in", () => {
        if (this._listScroll) ensureActorVisibleInScrollView(this._listScroll, item);
      });
      return item;
    }

    _addFooter(timelog) {
      const summary = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
      const line = new St.Label({
        text: this._summaryText(timelog),
        x_expand: true,
        style_class: `opn-timelog opn-timelog-${timelog.status}`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      const refresh = new St.Button({
        child: new St.Icon({ icon_name: "view-refresh-symbolic", style_class: "popup-menu-icon" }),
        style_class: "opn-icon-button",
        y_align: Clutter.ActorAlign.CENTER,
      });
      refresh.connect("clicked", () => this._callbacks.onRefresh());
      summary.add_child(line);
      summary.add_child(refresh);
      this.menu.addMenuItem(summary);

      const prefs = new PopupMenu.PopupMenuItem("Settings");
      prefs.connect("activate", () => this._closeMenuThen(() => this._callbacks.onPrefs()));
      this.menu.addMenuItem(prefs);
    }

    _summaryText(timelog) {
      const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
      const base = `Logged ${fmt(timelog.logged)}h / Plan ${fmt(timelog.planned)}h`;
      if (timelog.status === "green") return `${base} · all logged`;
      if (timelog.status === "yellow") return `${base} · today -${fmt(timelog.todayDeficit)}h`;
      return `${base} · behind -${fmt(timelog.deficit)}h`;
    }

    _closeMenuThen(action) {
      this.menu.close(BoxPointer.PopupAnimation.FULL);
      action();
    }
  },
);
