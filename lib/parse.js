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
    const actor = links.actor || {};
    const activity = links.activity || {};
    return {
      id: el.id,
      read: Boolean(el.readIAN),
      reason: el.reason || "",
      wpId: parseWorkPackageId(resource.href),
      wpTitle: resource.title || "",
      project: project.title || "",
      actor: actor.title || "",
      activityHref: activity.href || "",
      createdAt: el.createdAt || "",
    };
  });
}

// OpenProject embeds user mentions in text as an HTML <mention> tag, e.g.
// <mention ... data-text="@Jane Doe">@Jane Doe</mention>. For the plain-text
// menu we drop the tag and keep its visible label (the user name with @).
export function stripMentions(text) {
  return String(text || "").replace(
    /<mention\b[^>]*>([\s\S]*?)<\/mention>/g,
    (_, inner) => inner,
  );
}

// Extract the human-readable bits of an activity (journal): the comment and the
// already-localized field-change strings the server provides.
export function parseActivity(json) {
  if (!json || typeof json !== "object") return { comment: "", commentHtml: "", changes: [] };
  const comment = json.comment && typeof json.comment.raw === "string"
    ? stripMentions(json.comment.raw).trim()
    : "";
  const commentHtml = json.comment && typeof json.comment.html === "string"
    ? json.comment.html
    : "";
  const changes = Array.isArray(json.details)
    ? json.details
        .map((d) => (d && d.raw ? stripMentions(String(d.raw)).trim() : ""))
        .filter(Boolean)
    : [];
  return { comment, commentHtml, changes };
}

export function truncate(text, max = 80) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
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

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Absolute local time, e.g. "26 Jun 14:32"; the year is appended only when it
// differs from the current one, so recent items stay compact.
export function formatAbsolute(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${day}${year} ${time}`;
}
