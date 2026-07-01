// SPDX-License-Identifier: GPL-2.0-or-later
//
// Unit tests for lib/timelog.js. Run: gjs -m tests/timelog.test.js

import { computeTimelogStatus, DAILY_NORM_HOURS } from "../lib/timelog.js";

let failures = 0;
let total = 0;
function check(name, cond, extra) {
  total++;
  const mark = cond ? "OK" : "FAIL";
  if (!cond) failures++;
  print(`[${mark}] ${name}${extra !== undefined ? "  -> " + extra : ""}`);
}

// Local dates avoid timezone drift: construct "now" at local noon.
const now = new Date(2026, 6, 1, 12, 0, 0); // Wed 2026-07-01
const start = "2026-06-29"; // Mon

// Three weekdays in range: Mon 29, Tue 30, Wed 01(today). Plan = 3*8 = 24.
{
  const full = [
    { spentOn: "2026-06-29", hours: 8 },
    { spentOn: "2026-06-30", hours: 8 },
    { spentOn: "2026-07-01", hours: 8 },
  ];
  const r = computeTimelogStatus(full, start, now);
  check("norm constant", DAILY_NORM_HOURS === 8);
  check("planned=24", r.planned === 24, r.planned);
  check("logged=24", r.logged === 24, r.logged);
  check("all logged -> green", r.status === "green", r.status);
}

// Today short only -> yellow.
{
  const r = computeTimelogStatus(
    [
      { spentOn: "2026-06-29", hours: 8 },
      { spentOn: "2026-06-30", hours: 8 },
      { spentOn: "2026-07-01", hours: 2 },
    ],
    start,
    now,
  );
  check("today deficit -> yellow", r.status === "yellow", r.status);
  check("todayDeficit=6", r.todayDeficit === 6, r.todayDeficit);
}

// A previous day short -> red (even if today is complete).
{
  const r = computeTimelogStatus(
    [
      { spentOn: "2026-06-29", hours: 3 },
      { spentOn: "2026-06-30", hours: 8 },
      { spentOn: "2026-07-01", hours: 8 },
    ],
    start,
    now,
  );
  check("previous deficit -> red", r.status === "red", r.status);
}

// Weekend does not create a plan. Range Sat..Sun with nothing logged -> green.
{
  const sunNow = new Date(2026, 6, 5, 12, 0, 0); // Sun 2026-07-05
  const r = computeTimelogStatus([], "2026-07-04", sunNow); // Sat..Sun
  check("weekend-only -> green", r.status === "green", r.status);
  check("weekend planned=0", r.planned === 0, r.planned);
}

// Overlog on one day does not offset another day's deficit; the reported
// deficit is the summed per-day shortfall, not the net plan-minus-logged.
{
  const r = computeTimelogStatus(
    [
      { spentOn: "2026-06-29", hours: 16 },
      { spentOn: "2026-06-30", hours: 0 },
      { spentOn: "2026-07-01", hours: 8 },
    ],
    start,
    now,
  );
  check("overlog does not offset -> red", r.status === "red", r.status);
  // Mon overlogged (+8), Tue empty (-8), Wed full. Net would be 0, but the true
  // unmet is Tue's 8h.
  check("overlog deficit is per-day sum (8)", r.deficit === 8, r.deficit);
}

// Invalid or future start date -> zeros / green.
{
  const bad = computeTimelogStatus([], "not-a-date", now);
  check("bad start -> green zeros", bad.status === "green" && bad.planned === 0 && bad.deficit === 0);
  const future = computeTimelogStatus([], "2026-07-10", now); // after 'now'
  check("future start -> green zeros", future.status === "green" && future.planned === 0);
}

// Multiple entries on the same day are summed.
{
  const r = computeTimelogStatus(
    [
      { spentOn: "2026-06-29", hours: 5 },
      { spentOn: "2026-06-29", hours: 3 },
      { spentOn: "2026-06-30", hours: 8 },
      { spentOn: "2026-07-01", hours: 8 },
    ],
    start,
    now,
  );
  check("same-day entries summed -> green", r.status === "green", r.status);
  check("same-day logged=24", r.logged === 24, r.logged);
}

// Entries with a missing date or non-numeric hours are ignored, not fatal.
{
  const r = computeTimelogStatus(
    [
      { spentOn: "", hours: 8 },
      { spentOn: "2026-06-29", hours: "oops" },
      { spentOn: "2026-06-30", hours: 8 },
      { spentOn: "2026-07-01", hours: 8 },
    ],
    start,
    now,
  );
  // Mon counts 0 (non-numeric hours), so a previous day is behind -> red.
  check("bad entries ignored, Mon behind -> red", r.status === "red", r.status);
  check("bad entries do not inflate logged", r.logged === 16, r.logged);
}

print(`\n${total - failures}/${total} passed`);
if (failures > 0) imports.system.exit(1);
