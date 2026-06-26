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
  check("parse: read true on second", r[1].read === true);
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
