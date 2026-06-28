# 6. Fixed-height rows with a full-content modal dialog and markdown rendering

## Status
Accepted

## Context
Notification content (the comment and field changes) is markdown. The menu
previously showed variable-height rows and revealed the full text in a hover
tooltip. That tooltip rendered raw markdown without formatting and could not host
clickable links: the open menu holds the input grab, so the tooltip is not
interactive. The extension runs inside the gnome-shell process, where GTK is
unavailable; only Clutter/St widgets and the shell's St `ModalDialog` are usable.

## Decision
Menu rows are fixed at four lines (title, author/time, field changes, comment),
each ellipsized and padded with empty lines so every row has the same height.

The leading dot (●/○) is the read/unread toggle, replacing the trailing envelope
button from ADR 0005. A trailing jump button opens the work package in the
browser.

Activating a row opens a St `ModalDialog` with the full content. The dialog body
is rendered from the server-provided `comment.html`: a pure, unit-tested walker
(`lib/markup.js`) parses it by tag name (ignoring `op-uc-*` classes) into a small
block model, and `lib/dialog.js` builds St widgets from it. Inline emphasis,
headings, blockquotes, lists, code blocks, links and user mentions are rendered;
links and mentions are clickable (hit-tested via the clutter_text position). The
dialog also has an "Open in OpenProject" button. The hover tooltip is removed.

Opening the work package (the row jump button or the dialog button) still marks
the notification read, as in ADR 0005.

## Consequences
This is not a real OS window: it has no taskbar entry, lives above the shell and
follows the shell theme.

A hand-written tolerant HTML walker is maintained instead of a full parser; it is
pure and unit-tested. Elements beyond inline emphasis, headings, quotes, lists and
code blocks (tables, images, nesting deeper than one level) degrade to text rather
than render fully. Rendering depends on `comment.html`; when it is absent the
dialog degrades to the plain comment text.

This decision amends ADR 0005: the per-row read/unread toggle is now the leading
dot, and activating a row opens the detail dialog instead of the work package.
