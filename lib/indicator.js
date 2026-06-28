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

import { countUnread, formatTimestamp, formatAbsolute } from "./parse.js";
import { htmlToInlineMarkup, escapeMarkup } from "./markup.js";

// One panel icon; its color carries the state (red = unread, green = none).
const PANEL_ICON = "applications-engineering-symbolic";

export const OpenProjectIndicator = GObject.registerClass(
  class OpenProjectIndicator extends PanelMenu.Button {
    _init(callbacks, iconsPath) {
      super._init(0.5, "OpenProject Notifications");
      this._callbacks = callbacks;
      this._iconsPath = iconsPath;

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

      this._buildMenu([], 15);
    }

    setData(notifications, maxItems) {
      const unread = countUnread(notifications);
      this._badge.text = String(unread);
      this._badge.visible = unread > 0;
      this._setIconState(unread > 0 ? "unread" : "read");
      this._buildMenu(notifications, maxItems);
    }

    setError(message) {
      this._clearList();
      this.menu.removeAll();
      this._addHeader(0, 0);
      this.menu.addMenuItem(
        new PopupMenu.PopupMenuItem(message, { reactive: false }),
      );
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this._addFooter();
      this._badge.visible = false;
      this._setIconState("error");
    }

    // state: "unread" (red), "read" (green), "error" (theme default).
    _setIconState(state) {
      const color =
        state === "unread"
          ? "opn-icon-unread"
          : state === "read"
            ? "opn-icon-read"
            : "";
      this._icon.style_class = `system-status-icon ${color}`.trim();
    }

    _buildMenu(notifications, maxItems) {
      this._clearList();
      this.menu.removeAll();
      this._addHeader(notifications.length, countUnread(notifications));

      // The notification rows live in a scrollable region. A long list would
      // otherwise grow the menu past the screen and the BoxPointer would push
      // its top edge off-screen; with a scrollable section the menu's minimum
      // height stays small, so the panel-menu max-height (panelMenu.js) turns
      // into a scrollbar instead. Header and footer stay outside the scroll.
      const section = new PopupMenu.PopupMenuSection();
      const shown = notifications.slice(0, maxItems);
      if (shown.length === 0) {
        section.addMenuItem(
          new PopupMenu.PopupMenuItem("No notifications", { reactive: false }),
        );
      }
      for (const n of shown) section.addMenuItem(this._notificationItem(n));

      this._listScroll = new St.ScrollView({
        style_class: "opn-list-scroll vfade",
        x_expand: true,
        // A non-overlay scrollbar gets its own gutter and is draggable; an
        // overlay bar is painted over the reactive rows, which intercept the
        // drag. The gutter is always reserved while the list is scrollable.
        overlay_scrollbars: false,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        child: section.actor,
      });
      this.menu.box.add_child(this._listScroll);

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this._addFooter();
    }

    // The scrollable list is a raw actor in the menu box (not a PopupMenuItem),
    // so menu.removeAll() does not destroy it; remove it explicitly before a
    // rebuild to avoid orphaned scroll views stacking up.
    _clearList() {
      if (this._listScroll) {
        this._listScroll.destroy();
        this._listScroll = null;
      }
    }

    _addHeader(total, unread) {
      const header = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
      });
      const title = new St.Label({
        text: `OpenProject · ${unread} unread / ${total} total`,
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
      // "Mark all as read" sits at the far right of the header.
      const markAll = new St.Button({
        child: new St.Icon({ icon_name: "mail-read-symbolic", style_class: "popup-menu-icon" }),
        style_class: "opn-icon-button",
        y_align: Clutter.ActorAlign.CENTER,
      });
      markAll.connect("clicked", () =>
        this._closeMenuThen(() => this._callbacks.onMarkAllRead()),
      );
      header.add_child(title);
      header.add_child(refresh);
      header.add_child(markAll);
      this.menu.addMenuItem(header);
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
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
      // Each line is single-line and ellipsized; empty lines keep every row the
      // same height. A space placeholder forces the label to occupy a full line.
      const addLine = (text, styleClass) => {
        // Collapse newlines/runs of whitespace so a multi-line comment still
        // occupies exactly one line; single_line_mode + ellipsize keep every row
        // the same height regardless of content.
        const oneLine = (text || " ").replace(/\s+/g, " ");
        const label = new St.Label({ text: oneLine, style_class: styleClass });
        label.clutter_text.single_line_mode = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        labelBox.add_child(label);
      };
      // Like addLine, but the text is Pango markup (inline emphasis/code/links),
      // so the comment preview matches the formatting shown in the dialog.
      const addMarkupLine = (markup, styleClass) => {
        const label = new St.Label({ style_class: styleClass });
        label.clutter_text.single_line_mode = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        if (markup) label.clutter_text.set_markup(markup);
        else label.text = " ";
        labelBox.add_child(label);
      };

      // Five lines: title, meta, changes, a blank spacer, then the comment. The
      // blank separates the metadata block from the notification's main text.
      const titleText = n.wpId ? `#${n.wpId} ${n.wpTitle}` : n.wpTitle;
      addLine(titleText, n.read ? "opn-subject opn-subject-read" : "opn-subject");
      addLine(
        [n.actor || n.reason, formatTimestamp(n.createdAt), formatAbsolute(n.createdAt)]
          .filter(Boolean)
          .join(" · "),
        "opn-sub",
      );
      const detail = n.detail || {};
      addLine(detail.changes && detail.changes.length ? detail.changes.join(" · ") : "", "opn-detail");
      addLine("", "opn-spacer");
      const commentMarkup = detail.commentHtml
        ? htmlToInlineMarkup(detail.commentHtml)
        : detail.comment
          ? escapeMarkup(detail.comment)
          : "";
      addMarkupLine(commentMarkup, "opn-comment");

      // Quick jump to the work package in the browser; consumes its own click.
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
      // Activating the row (click on the body or arrows+Enter) opens the dialog
      // WITHOUT closing the menu: both paths call item.activate(), so overriding
      // it to skip the "activate" signal keeps the menu open behind the modal.
      // Escape then closes the dialog back to the menu; a second Escape (handled
      // by the menu itself) closes the menu.
      item.activate = () => this._callbacks.onShowDetail(n);
      // Keyboard navigation moves focus through rows that may be scrolled out of
      // view; St.ScrollView does not follow focus on its own, so scroll the
      // focused row into view (mouse/touchpad scrolling works without this).
      item.connect("key-focus-in", () => {
        if (this._listScroll) ensureActorVisibleInScrollView(this._listScroll, item);
      });
      return item;
    }

    _addFooter() {
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
