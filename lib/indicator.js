// SPDX-License-Identifier: GPL-2.0-or-later

import GObject from "gi://GObject";
import Gio from "gi://Gio";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import { ensureActorVisibleInScrollView } from "resource:///org/gnome/shell/misc/animationUtils.js";

import { countUnread, formatTimestamp } from "./parse.js";
import { htmlToInlineMarkup, escapeMarkup, metaMarkup } from "./markup.js";

// One panel icon; its colour reflects the notifications state only
// (red = unread, green = none). The work-log status never touches the icon.
const PANEL_ICON = "applications-engineering-symbolic";

// Tint a task row by its workflow status: closed/solved dimmed, returned in red,
// in-review in green. The keys are status names from the OpenProject instance.
const TASK_STATUS_CLASS = {
  "Возврат": "opn-task-danger",
  "На ревью": "opn-task-success",
  "В работе": "opn-task-warn",
  "Закрыто": "opn-task-dimmed",
  "Решено": "opn-task-dimmed",
};

const EMPTY_TIMELOG = { logged: 0, planned: 0, todayDeficit: 0, deficit: 0, status: "green" };

export const OpenProjectIndicator = GObject.registerClass(
  class OpenProjectIndicator extends PanelMenu.Button {
    _init(callbacks, iconsPath) {
      super._init(0.5, "OpenProject");
      this._callbacks = callbacks;
      this._iconsPath = iconsPath;

      this._notifications = [];
      this._notifError = null;
      this._tasks = [];
      this._timelog = EMPTY_TIMELOG;
      this._tasksError = null;
      this._maxItems = 15;

      const box = new St.BoxLayout({ style_class: "panel-status-menu-box" });
      this._icon = new St.Icon({
        icon_name: PANEL_ICON,
        style_class: "system-status-icon opn-icon-read",
      });
      this._badge = new St.Label({
        style_class: "opn-badge",
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
      });
      box.add_child(this._icon);
      box.add_child(this._badge);
      this.add_child(box);

      // Reset both lists to the top every time the menu opens, so the freshest
      // notifications and tasks are visible without scrolling back up.
      this.menu.connect("open-state-changed", (_menu, open) => {
        if (open) this._scrollColumnsToTop();
      });

      this._rebuild();
    }

    // Notifications drive the panel icon colour and the left column.
    setNotifications(notifications, maxItems) {
      this._notifications = notifications;
      this._notifError = null;
      this._maxItems = maxItems;
      const unread = countUnread(notifications);
      this._badge.text = String(unread);
      this._badge.visible = unread > 0;
      this._setIconUnread(unread > 0);
      this._rebuild();
    }

    // Tasks + work-log fill the right column; they never affect the panel icon.
    setTasks(tasks, timelog, maxItems) {
      this._tasks = tasks;
      this._timelog = timelog || EMPTY_TIMELOG;
      this._tasksError = null;
      this._maxItems = maxItems;
      this._rebuild();
    }

    setNotificationsError(message) {
      this._notifError = message;
      this._badge.visible = false;
      this._setIconUnread(false);
      this._rebuild();
    }

    setTasksError(message) {
      this._tasksError = message;
      this._rebuild();
    }

    _setIconUnread(unread) {
      this._icon.style_class = `system-status-icon ${unread ? "opn-icon-unread" : "opn-icon-read"}`;
    }

    _rebuild() {
      this._clearColumns();
      this.menu.removeAll();

      // Two side-by-side columns in a single menu: notifications on the left,
      // my tasks + work-log on the right. Each column scrolls independently.
      this._columns = new St.BoxLayout({ style_class: "opn-columns", x_expand: true });
      this._columns.add_child(this._buildNotificationsColumn());
      this._columns.add_child(this._buildTasksColumn());
      this.menu.box.add_child(this._columns);

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this._addFooter();
    }

    _scrollColumnsToTop() {
      if (this._notifScroll) this._notifScroll.vadjustment.value = 0;
      if (this._tasksScroll) this._tasksScroll.vadjustment.value = 0;
    }

    // Raw actors in the menu box survive menu.removeAll(); destroy them explicitly.
    _clearColumns() {
      if (this._columns) {
        this._columns.destroy();
        this._columns = null;
        this._notifScroll = null;
        this._tasksScroll = null;
      }
    }

    _buildNotificationsColumn() {
      const col = new St.BoxLayout({ vertical: true, style_class: "opn-column" });
      const unread = countUnread(this._notifications);
      col.add_child(this._columnTitle(`OpenProject · ${unread} unread / ${this._notifications.length} total`));

      const section = new PopupMenu.PopupMenuSection();
      if (this._notifError) {
        section.addMenuItem(new PopupMenu.PopupMenuItem(this._notifError, { reactive: false }));
      } else {
        const shown = this._notifications.slice(0, this._maxItems);
        if (shown.length === 0)
          section.addMenuItem(new PopupMenu.PopupMenuItem("No notifications", { reactive: false }));
        for (const n of shown) section.addMenuItem(this._notificationItem(n));
      }
      this._notifScroll = this._scroll(section);
      col.add_child(this._notifScroll);
      return col;
    }

    _buildTasksColumn() {
      const col = new St.BoxLayout({ vertical: true, style_class: "opn-column" });
      col.add_child(this._columnTitle("My tasks"));

      const section = new PopupMenu.PopupMenuSection();
      if (this._tasksError) {
        section.addMenuItem(new PopupMenu.PopupMenuItem(this._tasksError, { reactive: false }));
      } else {
        const shown = this._tasks.slice(0, this._maxItems);
        if (shown.length === 0)
          section.addMenuItem(new PopupMenu.PopupMenuItem("No tasks", { reactive: false }));
        for (const t of shown) section.addMenuItem(this._taskItem(t));
      }
      this._tasksScroll = this._scroll(section);
      col.add_child(this._tasksScroll);

      // Fixed work-log summary at the bottom of the column, coloured by status.
      const t = this._timelog;
      const summary = new St.Label({
        text: this._summaryText(t),
        style_class: `opn-timelog opn-timelog-${t.status}`,
      });
      summary.clutter_text.line_wrap = true;
      col.add_child(summary);
      return col;
    }

    _columnTitle(text) {
      return new St.Label({ text, style_class: "opn-col-title" });
    }

    _scroll(section) {
      // A non-overlay scrollbar gets its own gutter and is draggable; an overlay
      // bar is painted over the reactive rows, which intercept the drag.
      return new St.ScrollView({
        style_class: "opn-list-scroll vfade",
        x_expand: true,
        y_expand: true,
        overlay_scrollbars: false,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        child: section.actor,
      });
    }

    _notificationItem(n) {
      const item = new PopupMenu.PopupBaseMenuItem({ style_class: "opn-item" });

      // Left dot doubles as the read/unread toggle; its click is consumed so it
      // does not also activate the row (which opens the detail dialog).
      const dot = new St.Button({
        label: n.read ? "○" : "●",
        style_class: n.read ? "opn-dot opn-dot-read" : "opn-dot opn-dot-unread",
        y_align: Clutter.ActorAlign.START,
      });
      dot.connect("clicked", () => this._callbacks.onToggleRead(n));

      const labelBox = new St.BoxLayout({ vertical: true, x_expand: true, style_class: "opn-item-lines" });
      const addLine = (text, styleClass) => {
        const oneLine = (text || " ").replace(/\s+/g, " ");
        const label = new St.Label({ text: oneLine, style_class: styleClass });
        label.clutter_text.single_line_mode = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        labelBox.add_child(label);
      };
      const addMarkupLine = (markup, styleClass) => {
        const label = new St.Label({ style_class: styleClass });
        label.clutter_text.single_line_mode = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        if (markup) label.clutter_text.set_markup(markup);
        else label.text = " ";
        labelBox.add_child(label);
      };

      const titleText = n.wpId ? `#${n.wpId} ${n.wpTitle}` : n.wpTitle;
      addLine(titleText, n.read ? "opn-subject opn-subject-read" : "opn-subject");
      addMarkupLine(metaMarkup(n, "70%"), "opn-sub");
      const detail = n.detail || {};
      addLine(detail.changes && detail.changes.length ? detail.changes.join(" · ") : "", "opn-detail");
      addLine("", "opn-spacer");
      const commentMarkup = detail.commentHtml
        ? htmlToInlineMarkup(detail.commentHtml)
        : detail.comment
          ? escapeMarkup(detail.comment)
          : "";
      addMarkupLine(commentMarkup, "opn-comment");

      const open = new St.Button({
        child: new St.Icon({
          gicon: Gio.icon_new_for_string(`${this._iconsPath}/opn-external-link-symbolic.svg`),
          style_class: "popup-menu-icon",
        }),
        style_class: "opn-icon-button",
        y_align: Clutter.ActorAlign.START,
      });
      open.connect("clicked", () => this._closeMenuThen(() => this._callbacks.onOpen(n)));

      item.add_child(dot);
      item.add_child(labelBox);
      item.add_child(open);
      // Activating the row opens the modal dialog WITHOUT closing the menu.
      item.activate = () => this._callbacks.onShowDetail(n);
      item.connect("key-focus-in", () => {
        if (this._notifScroll) ensureActorVisibleInScrollView(this._notifScroll, item);
      });
      return item;
    }

    _taskItem(t) {
      const item = new PopupMenu.PopupBaseMenuItem({ style_class: "opn-item" });
      // The status class sets `color`, which St inherits into both text lines
      // below (neither sets its own colour).
      const statusClass = TASK_STATUS_CLASS[t.status];
      const labelBox = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: statusClass ? `opn-item-lines ${statusClass}` : "opn-item-lines",
      });

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

      // Quick jump to the work package in the browser; consumes its own click.
      const open = new St.Button({
        child: new St.Icon({
          gicon: Gio.icon_new_for_string(`${this._iconsPath}/opn-external-link-symbolic.svg`),
          style_class: "popup-menu-icon",
        }),
        style_class: "opn-icon-button",
        y_align: Clutter.ActorAlign.START,
      });
      open.connect("clicked", () => this._closeMenuThen(() => this._callbacks.onOpenTask(t)));

      item.add_child(labelBox);
      item.add_child(open);
      // Activating the row opens the full-content dialog WITHOUT closing the menu
      // (same as notifications); the dialog reopens the menu on Escape/Close.
      item.activate = () => this._callbacks.onShowTask(t);
      item.connect("key-focus-in", () => {
        if (this._tasksScroll) ensureActorVisibleInScrollView(this._tasksScroll, item);
      });
      return item;
    }

    _summaryText(t) {
      const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
      const base = `Logged ${fmt(t.logged)}h / Plan ${fmt(t.planned)}h`;
      if (t.status === "green") return `${base} · all logged`;
      if (t.status === "yellow") return `${base} · today -${fmt(t.todayDeficit)}h`;
      return `${base} · behind -${fmt(t.deficit)}h`;
    }

    _addFooter() {
      const refresh = new PopupMenu.PopupMenuItem("Refresh");
      // Keep the menu open on refresh: it rebuilds in place with fresh data (like
      // the read-toggle dot). Overriding activate skips the emit('activate') whose
      // AFTER handler would otherwise auto-close the top menu.
      refresh.activate = () => this._callbacks.onRefresh();
      this.menu.addMenuItem(refresh);

      const prefs = new PopupMenu.PopupMenuItem("Settings");
      prefs.connect("activate", () => this._closeMenuThen(() => this._callbacks.onPrefs()));
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
