// SPDX-License-Identifier: GPL-2.0-or-later
//
// Unit tests for lib/parse.js. Run: gjs -m tests/parse.test.js

import {
  parseNotifications,
  parseWorkPackageId,
  buildWorkPackageUrl,
  countUnread,
  newUnreadIds,
  formatTimestamp,
  formatAbsolute,
  parseActivity,
  truncate,
  stripMentions,
} from "../lib/parse.js";

let failures = 0;
let total = 0;

function check(name, cond, extra) {
  total++;
  const mark = cond ? "OK" : "FAIL";
  if (!cond) failures++;
  print(`[${mark}] ${name}${extra !== undefined ? "  -> " + extra : ""}`);
}

const sample = {
  _embedded: {
    elements: [
      {
        id: 1,
        readIAN: false,
        reason: "assigned",
        createdAt: "2026-06-26T13:14:21Z",
        _links: {
          resource: { href: "/openproject/work_packages/14344", title: "Error" },
          project: { title: "Horizon" },
          actor: { href: "/openproject/api/v3/users/32", title: "Jane Doe" },
          activity: { href: "/openproject/api/v3/activities/261301" },
        },
      },
      {
        id: 2,
        readIAN: true,
        reason: "mentioned",
        createdAt: "2026-06-26T11:57:38Z",
        _links: {
          resource: { href: "/openproject/work_packages/14302", title: "Change" },
          project: { title: "Horizon" },
        },
      },
    ],
  },
};

// parseNotifications -------------------------------------------------------
{
  const r = parseNotifications(sample);
  check("parse: length 2", r.length === 2, r.length);
  check("parse: id", r[0].id === 1);
  check("parse: read false", r[0].read === false);
  check("parse: reason", r[0].reason === "assigned");
  check("parse: wpId", r[0].wpId === 14344, r[0].wpId);
  check("parse: wpTitle", r[0].wpTitle === "Error");
  check("parse: project", r[0].project === "Horizon");
  check("parse: createdAt", r[0].createdAt === "2026-06-26T13:14:21Z");
  check("parse: actor", r[0].actor === "Jane Doe", r[0].actor);
  check("parse: activityHref", r[0].activityHref === "/openproject/api/v3/activities/261301", r[0].activityHref);
  check("parse: missing actor -> ''", r[1].actor === "");
  check("parse: read true on second", r[1].read === true);
}

// parseActivity ------------------------------------------------------------
{
  const act = {
    _type: "Activity::Comment",
    comment: { raw: "Проверено на девеле, работает" },
    details: [{ raw: "Статус изменено с Решено на Закрыто" }, { raw: "" }],
  };
  const a = parseActivity(act);
  check("activity: comment", a.comment === "Проверено на девеле, работает", a.comment);
  check("activity: changes len 1 (drops empty)", a.changes.length === 1, a.changes.length);
  check("activity: change text", a.changes[0] === "Статус изменено с Решено на Закрыто");
  const empty = parseActivity(null);
  check("activity: null -> empty", empty.comment === "" && empty.changes.length === 0);
  const noComment = parseActivity({ details: [{ raw: "X" }] });
  check("activity: no comment -> ''", noComment.comment === "" && noComment.changes.length === 1);

  const withHtml = parseActivity({
    comment: { raw: "hi", html: '<p class="op-uc-p">hi</p>' },
    details: [{ raw: "x" }],
  });
  check("activity: commentHtml passed through",
    withHtml.commentHtml === '<p class="op-uc-p">hi</p>', withHtml.commentHtml);
  const noHtml = parseActivity({ comment: { raw: "hi" } });
  check("activity: commentHtml empty when absent", noHtml.commentHtml === "", noHtml.commentHtml);
  check("activity: commentHtml empty on empty input", parseActivity({}).commentHtml === "");
}

// stripMentions ------------------------------------------------------------
{
  const raw =
    'foo <mention class="mention" data-id="30" data-type="user" ' +
    'data-text="@Jane Doe">@Jane Doe</mention> bar';
  check("mention: replaced by label", stripMentions(raw) === "foo @Jane Doe bar", stripMentions(raw));
  const two =
    '<mention data-text="@A">@A</mention> and <mention data-text="@B">@B</mention>';
  check("mention: multiple", stripMentions(two) === "@A and @B", stripMentions(two));
  check("mention: none unchanged", stripMentions("plain text") === "plain text");
  check("mention: empty/null", stripMentions("") === "" && stripMentions(null) === "");
  const inActivity = parseActivity({
    comment: { raw: 'hi <mention data-text="@Jane Doe">@Jane Doe</mention>' },
    details: [{ raw: 'set to <mention data-text="@Bob">@Bob</mention>' }],
  });
  check("mention: applied in comment", inActivity.comment === "hi @Jane Doe", inActivity.comment);
  check("mention: applied in changes", inActivity.changes[0] === "set to @Bob", inActivity.changes[0]);
}

// truncate -----------------------------------------------------------------
{
  check("truncate: short unchanged", truncate("abc", 10) === "abc");
  check("truncate: long ellipsis", truncate("abcdefghij", 5) === "abcd…", truncate("abcdefghij", 5));
  check("truncate: empty", truncate("", 5) === "" && truncate(null, 5) === "");
}

// empty / malformed --------------------------------------------------------
{
  check("parse: empty object -> []", parseNotifications({}).length === 0);
  check("parse: null -> []", parseNotifications(null).length === 0);
}

// parseWorkPackageId -------------------------------------------------------
{
  check("wpId: extract", parseWorkPackageId("/openproject/work_packages/14344") === 14344);
  check("wpId: none -> null", parseWorkPackageId("/foo") === null);
}

// buildWorkPackageUrl ------------------------------------------------------
{
  check(
    "url: strips trailing slash",
    buildWorkPackageUrl("https://op.example.com/openproject/", 7) ===
      "https://op.example.com/openproject/work_packages/7",
    buildWorkPackageUrl("https://op.example.com/openproject/", 7),
  );
}

// countUnread --------------------------------------------------------------
{
  check("countUnread: 1", countUnread(parseNotifications(sample)) === 1);
}

// newUnreadIds -------------------------------------------------------------
{
  const n = parseNotifications(sample);
  check("newUnread: from empty -> [1]", JSON.stringify(newUnreadIds([], n)) === "[1]");
  check("newUnread: known -> []", JSON.stringify(newUnreadIds([1], n)) === "[]");
}

// formatTimestamp ----------------------------------------------------------
{
  const now = new Date("2026-06-26T13:20:00Z");
  check("time: 6 min ago", formatTimestamp("2026-06-26T13:14:21Z", now) === "6 min ago", formatTimestamp("2026-06-26T13:14:21Z", now));
  check("time: bad -> ''", formatTimestamp("bad", now) === "");
}

// formatAbsolute -----------------------------------------------------------
{
  const now = new Date("2026-06-26T13:20:00Z");
  const sameYear = formatAbsolute("2026-06-26T11:05:00Z", now);
  check("abs: same year hides year", !/\d{4}/.test(sameYear), sameYear);
  check("abs: ends with HH:MM", /\d{2}:\d{2}$/.test(sameYear), sameYear);
  const otherYear = formatAbsolute("2025-01-02T08:00:00Z", now);
  check("abs: other year shows year", /2025/.test(otherYear), otherYear);
  check("abs: bad -> ''", formatAbsolute("bad", now) === "");
}

print(`\n${total - failures}/${total} passed`);
if (failures > 0) imports.system.exit(1);
