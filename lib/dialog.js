// SPDX-License-Identifier: GPL-2.0-or-later
//
// Modal dialog showing the full, formatted content of a notification: the work
// package title, author/time, the rendered comment (from comment.html) and the
// field changes. Built from the block model produced by lib/markup.js.

import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

import { htmlToBlocks, metaMarkup } from "./markup.js";

// ClutterText.coords_to_position returns a UTF-8 *byte* index, while the link
// ranges from markup.js are JS string (UTF-16) offsets. Convert so hit-testing
// lands on the right character in non-ASCII (e.g. Cyrillic) text.
function byteToCharIndex(str, byteOffset) {
  let bytes = 0;
  for (let i = 0; i < str.length; ) {
    if (bytes >= byteOffset) return i;
    const cp = str.codePointAt(i);
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    i += cp > 0xffff ? 2 : 1;
  }
  return str.length;
}

export const NotificationDialog = GObject.registerClass(
  class NotificationDialog extends ModalDialog.ModalDialog {
    // n: notification with .detail {commentHtml, comment, changes}.
    // actions.onOpen(n): open the work package (and mark it read);
    // actions.openUrl(url): open an inline link in the browser;
    // actions.resolveHref(href): turn a relative href into an absolute URL;
    // actions.onClose(): called when the dialog is dismissed via Escape/Close
    // (NOT when navigating away to the browser), so the caller can restore the
    // menu the dialog was opened from.
    _init(n, actions) {
      super._init({ styleClass: "opn-dialog" });
      this._openUrl = actions.openUrl;
      this._resolveHref = actions.resolveHref;

      const box = new St.BoxLayout({ vertical: true, style_class: "opn-dialog-box" });

      const titleText = n.wpId ? `#${n.wpId} ${n.wpTitle}` : n.wpTitle;
      box.add_child(new St.Label({ text: titleText, style_class: "opn-dialog-title" }));
      const meta = metaMarkup(n, "60%");
      if (meta) {
        const metaLabel = new St.Label({ style_class: "opn-dialog-meta" });
        metaLabel.clutter_text.set_markup(meta);
        box.add_child(metaLabel);
      }

      const content = new St.BoxLayout({ vertical: true, style_class: "opn-dialog-content" });
      const scroll = new St.ScrollView({
        style_class: "opn-dialog-scroll",
        x_expand: true,
        y_expand: true,
        overlay_scrollbars: true,
        child: content,
      });
      box.add_child(scroll);

      const detail = n.detail || {};
      if (detail.changes && detail.changes.length > 0) {
        for (const c of detail.changes) {
          content.add_child(new St.Label({ text: c, style_class: "opn-dialog-change" }));
        }
      }
      const blocks = detail.commentHtml ? htmlToBlocks(detail.commentHtml) : [];
      if (blocks.length > 0) {
        for (const b of blocks) content.add_child(this._buildBlock(b));
      } else if (detail.comment) {
        content.add_child(this._wrapLabel(detail.comment, "opn-dialog-para"));
      }
      if ((!detail.changes || detail.changes.length === 0) && blocks.length === 0 && !detail.comment) {
        content.add_child(new St.Label({ text: "No details", style_class: "opn-dialog-meta" }));
      }

      this.contentLayout.add_child(box);

      const hasOpen = Boolean(n.wpId);
      if (hasOpen) {
        this.addButton({
          label: "Open in OpenProject",
          // The primary action is focused by default, so Enter opens the work package.
          default: true,
          action: () => { this.close(); actions.onOpen(n); },
        });
      }
      this.addButton({
        label: "Close",
        action: () => {
          this.close();
          if (actions.onClose) actions.onClose();
        },
        key: Clutter.KEY_Escape,
        default: !hasOpen,
      });
    }

    _buildBlock(b) {
      if (b.type === "heading") return this._markupLabel(b, `opn-dialog-h${b.level}`);
      if (b.type === "para") return this._markupLabel(b, "opn-dialog-para");
      if (b.type === "code") return this._wrapLabel(b.text, "opn-dialog-code");
      if (b.type === "quote") {
        const q = new St.BoxLayout({ vertical: true, style_class: "opn-dialog-quote" });
        for (const inner of b.blocks) q.add_child(this._buildBlock(inner));
        return q;
      }
      if (b.type === "list") {
        const list = new St.BoxLayout({ vertical: true, style_class: "opn-dialog-list" });
        let num = 1;
        for (const item of b.items) {
          const prefix = b.ordered ? `${num++}. ` : "• ";
          list.add_child(this._markupLabel(
            { markup: prefix + item.markup, links: item.links }, "opn-dialog-li", prefix.length));
        }
        return list;
      }
      return this._wrapLabel("", "opn-dialog-para");
    }

    // Label whose text is set via Pango markup; wires click handling for links.
    _markupLabel(block, styleClass, offset = 0) {
      const label = this._wrapLabel("", styleClass);
      label.clutter_text.set_markup(block.markup);
      if (block.links && block.links.length > 0) {
        label.reactive = true;
        label.connect("button-release-event", (actor, event) => {
          const [x, y] = event.get_coords();
          const [ok, lx, ly] = actor.transform_stage_point(x, y);
          if (!ok) return Clutter.EVENT_PROPAGATE;
          const bytePos = actor.clutter_text.coords_to_position(lx, ly);
          const pos = byteToCharIndex(actor.clutter_text.get_text(), bytePos) - offset;
          const hit = block.links.find((lk) => pos >= lk.start && pos < lk.end);
          if (hit) {
            this.close();
            this._openUrl(this._resolveHref(hit.href));
            return Clutter.EVENT_STOP;
          }
          return Clutter.EVENT_PROPAGATE;
        });
      }
      return label;
    }

    _wrapLabel(text, styleClass) {
      const label = new St.Label({ text, style_class: styleClass });
      label.clutter_text.line_wrap = true;
      label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
      label.x_expand = true;
      return label;
    }
  },
);
