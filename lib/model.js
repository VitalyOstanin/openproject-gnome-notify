// SPDX-License-Identifier: GPL-2.0-or-later
//
// Pure helpers (no GNOME imports): shape openproject-cli JSON into row models.

function asArray(json) {
  return Array.isArray(json) ? json : [];
}

export function parseTasks(json) {
  return asArray(json).map((t) => ({
    id: t.id,
    subject: t.subject || "",
    status: t.status || "",
    type: t.type || "",
    priority: t.priority || "",
    project: t.project || "",
    author: t.author || "",
    assignee: t.assignee || "",
    startDate: t.startDate || "",
    dueDate: t.dueDate || "",
    percentageDone: t.percentageDone ?? null,
    description: t.description || "",
    createdAt: t.createdAt || "",
    updatedAt: t.updatedAt || "",
  }));
}

export function parseTimeEntries(json) {
  return asArray(json).map((e) => ({
    spentOn: e.spentOn || "",
    hours: Number(e.hours) || 0,
  }));
}

export function parseCliNotifications(json) {
  return asArray(json).map((n) => ({
    id: n.id,
    read: Boolean(n.read),
    reason: n.reason || "",
    wpId: n.wpId ?? null,
    wpTitle: n.wpTitle || "",
    project: n.project || "",
    actor: n.actor || "",
    activityHref: n.activityHref || "",
    createdAt: n.createdAt || "",
  }));
}
