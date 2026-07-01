// SPDX-License-Identifier: GPL-2.0-or-later
//
// Unit tests for lib/model.js. Run: gjs -m tests/model.test.js

import { parseTasks, parseTimeEntries, parseCliNotifications } from "../lib/model.js";

let failures = 0;
let total = 0;
function check(name, cond, extra) {
  total++;
  const mark = cond ? "OK" : "FAIL";
  if (!cond) failures++;
  print(`[${mark}] ${name}${extra !== undefined ? "  -> " + extra : ""}`);
}

// parseTasks ---------------------------------------------------------------
{
  const json = [
    { id: 100, subject: "Import RVD", updatedAt: "2026-06-30T10:00:00Z", status: "In progress", project: "Horizon" },
    { id: 50, subject: "CSV mart", updatedAt: "2026-07-01T09:00:00Z", status: "Closed", project: "Horizon" },
  ];
  const r = parseTasks(json);
  check("tasks: length", r.length === 2, r.length);
  check("tasks: id/subject", r[0].id === 100 && r[0].subject === "Import RVD");
  check("tasks: status", r[1].status === "Closed");
  check("tasks: null -> []", parseTasks(null).length === 0);
}

// parseTimeEntries ---------------------------------------------------------
{
  const json = [
    { spentOn: "2026-06-30", hours: 2.5 },
    { spentOn: "2026-07-01", hours: 8 },
  ];
  const r = parseTimeEntries(json);
  check("time: length", r.length === 2, r.length);
  check("time: fields", r[0].spentOn === "2026-06-30" && r[0].hours === 2.5);
  check("time: null -> []", parseTimeEntries(null).length === 0);
}

// parseCliNotifications ----------------------------------------------------
{
  const json = [
    {
      id: 5, reason: "assigned", read: false, wpId: 14344, wpTitle: "Error",
      project: "Horizon", actor: "Jane Doe",
      activityHref: "/api/v3/activities/261301", createdAt: "2026-06-26T13:14:21Z",
    },
  ];
  const r = parseCliNotifications(json);
  check("notif: id", r[0].id === 5);
  check("notif: read bool", r[0].read === false);
  check("notif: wpId", r[0].wpId === 14344);
  check("notif: activityHref", r[0].activityHref === "/api/v3/activities/261301");
  check("notif: null -> []", parseCliNotifications(null).length === 0);
}

print(`\n${total - failures}/${total} passed`);
if (failures > 0) imports.system.exit(1);
