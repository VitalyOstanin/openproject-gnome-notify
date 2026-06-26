// SPDX-License-Identifier: GPL-2.0-or-later
//
// Pure helpers with no GNOME imports, so they run under plain gjs for tests.

export function parseNotifications(json) {
  const elements = json && json._embedded && json._embedded.elements;
  if (!Array.isArray(elements)) return [];
  return elements.map((el) => {
    const links = el._links || {};
    const resource = links.resource || {};
    const project = links.project || {};
    return {
      id: el.id,
      read: Boolean(el.readIAN),
      reason: el.reason || "",
      wpId: parseWorkPackageId(resource.href),
      wpTitle: resource.title || "",
      project: project.title || "",
      createdAt: el.createdAt || "",
    };
  });
}

export function parseWorkPackageId(href) {
  const m = /\/work_packages\/(\d+)/.exec(href || "");
  return m ? Number(m[1]) : null;
}

export function buildWorkPackageUrl(host, wpId) {
  const base = String(host || "").replace(/\/+$/, "");
  return `${base}/work_packages/${wpId}`;
}

export function countUnread(notifications) {
  return notifications.filter((n) => !n.read).length;
}

export function newUnreadIds(prevIds, notifications) {
  const prev = new Set(prevIds || []);
  return notifications.filter((n) => !n.read && !prev.has(n.id)).map((n) => n.id);
}

export function formatTimestamp(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.round((now.getTime() - d.getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
