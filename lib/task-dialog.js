// SPDX-License-Identifier: GPL-2.0-or-later
//
// Modal dialog showing the full content of a work package (task): the subject,
// key fields and the description text.

import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

import { formatTimestamp } from "./parse.js";

export const TaskDialog = GObject.registerClass(
  class TaskDialog extends ModalDialog.ModalDialog {
    // t: task from parseTasks. actions.onOpen(t): open in the browser;
    // actions.onClose(): called when dismissed via Escape/Close so the caller
    // can restore the menu the dialog was opened from.
    _init(t, actions) {
      super._init({ styleClass: "opn-dialog" });

      const box = new St.BoxLayout({ vertical: true, style_class: "opn-dialog-box" });

      const titleText = t.id ? `#${t.id} ${t.subject}` : t.subject;
      box.add_child(new St.Label({ text: titleText, style_class: "opn-dialog-title" }));

      const metaParts = [t.type, t.status, t.project].filter(Boolean);
      if (t.updatedAt) metaParts.push(`updated ${formatTimestamp(t.updatedAt)}`);
      if (metaParts.length > 0)
        box.add_child(new St.Label({ text: metaParts.join(" · "), style_class: "opn-dialog-meta" }));

      const content = new St.BoxLayout({ vertical: true, style_class: "opn-dialog-content" });
      const scroll = new St.ScrollView({
        style_class: "opn-dialog-scroll",
        x_expand: true,
        y_expand: true,
        overlay_scrollbars: true,
        child: content,
      });
      box.add_child(scroll);

      for (const [name, value] of this._fields(t)) {
        const row = new St.BoxLayout({ style_class: "opn-dialog-field" });
        row.add_child(new St.Label({ text: `${name}: `, style_class: "opn-dialog-field-name" }));
        row.add_child(this._wrapLabel(value, "opn-dialog-field-value"));
        content.add_child(row);
      }

      if (t.description) {
        content.add_child(new St.Label({ text: "Description", style_class: "opn-dialog-h3" }));
        content.add_child(this._wrapLabel(t.description, "opn-dialog-para"));
      } else {
        content.add_child(new St.Label({ text: "No description", style_class: "opn-dialog-meta" }));
      }

      this.contentLayout.add_child(box);

      const hasOpen = Boolean(t.id);
      if (hasOpen) {
        this.addButton({
          label: "Open in OpenProject",
          // The primary action is focused by default, so Enter opens the task.
          default: true,
          action: () => { this.close(); actions.onOpen(t); },
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

    _fields(t) {
      const rows = [];
      if (t.assignee) rows.push(["Assignee", t.assignee]);
      if (t.author) rows.push(["Author", t.author]);
      if (t.priority) rows.push(["Priority", t.priority]);
      if (t.percentageDone !== null && t.percentageDone !== undefined)
        rows.push(["Done", `${t.percentageDone}%`]);
      if (t.startDate) rows.push(["Start", t.startDate]);
      if (t.dueDate) rows.push(["Due", t.dueDate]);
      return rows;
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
