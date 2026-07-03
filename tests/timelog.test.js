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

// --- Discarding fully-filled past weeks (any position; current week kept) ---

// All past weeks are fully filled -> only the current week counts toward the
// displayed plan/fact.
{
  const wed15 = new Date(2026, 6, 15, 12, 0, 0); // Wed 2026-07-15
  const start15 = "2026-06-29"; // Mon, two full weeks before the current one
  const entries = [];
  // Week A: Mon 06-29 .. Fri 07-03
  for (const d of ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"])
    entries.push({ spentOn: d, hours: 8 });
  // Week B: Mon 07-06 .. Fri 07-10
  for (const d of ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"])
    entries.push({ spentOn: d, hours: 8 });
  // Current week: Mon 07-13, Tue 07-14, Wed 07-15 (today)
  for (const d of ["2026-07-13", "2026-07-14", "2026-07-15"]) entries.push({ spentOn: d, hours: 8 });
  const r = computeTimelogStatus(entries, start15, wed15);
  check("full past weeks discarded -> planned=24", r.planned === 24, r.planned);
  check("full past weeks discarded -> logged=24", r.logged === 24, r.logged);
  check("all discarded/current logged -> green", r.status === "green", r.status);
}

// A past week that is not fully filled is kept (its plan/fact counted, and its
// deficit makes the status red).
{
  const wed15 = new Date(2026, 6, 15, 12, 0, 0); // Wed 2026-07-15
  const start15 = "2026-06-29";
  const entries = [];
  // Week A full
  for (const d of ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"])
    entries.push({ spentOn: d, hours: 8 });
  // Week B: Tue 07-07 left at 0 -> not full (deficit 8)
  for (const d of ["2026-07-06", "2026-07-08", "2026-07-09", "2026-07-10"])
    entries.push({ spentOn: d, hours: 8 });
  // Current week full so far
  for (const d of ["2026-07-13", "2026-07-14", "2026-07-15"]) entries.push({ spentOn: d, hours: 8 });
  const r = computeTimelogStatus(entries, start15, wed15);
  check("kept week B + current -> planned=64", r.planned === 64, r.planned);
  check("kept week B + current -> logged=56", r.logged === 56, r.logged);
  check("unfilled past week -> red", r.status === "red", r.status);
  check("deficit is the week B shortfall (8)", r.deficit === 8, r.deficit);
}

// Non-contiguous discard: full, not-full, full, current. The full middle week
// (week C) is discarded even though it sits after the unfilled week B.
{
  const wed22 = new Date(2026, 6, 22, 12, 0, 0); // Wed 2026-07-22
  const start22 = "2026-06-29";
  const entries = [];
  // Week A full
  for (const d of ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"])
    entries.push({ spentOn: d, hours: 8 });
  // Week B not full: Wed 07-08 = 0
  for (const d of ["2026-07-06", "2026-07-07", "2026-07-09", "2026-07-10"])
    entries.push({ spentOn: d, hours: 8 });
  // Week C full
  for (const d of ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"])
    entries.push({ spentOn: d, hours: 8 });
  // Current week full so far
  for (const d of ["2026-07-20", "2026-07-21", "2026-07-22"]) entries.push({ spentOn: d, hours: 8 });
  const r = computeTimelogStatus(entries, start22, wed22);
  check("non-contiguous: only week B + current -> planned=64", r.planned === 64, r.planned);
  check("non-contiguous: only week B + current -> logged=56", r.logged === 56, r.logged);
  check("non-contiguous deficit=8", r.deficit === 8, r.deficit);
  check("non-contiguous -> red", r.status === "red", r.status);
}

// The current week, even when fully filled so far, is never discarded.
{
  const wed15 = new Date(2026, 6, 15, 12, 0, 0); // Wed 2026-07-15
  const r = computeTimelogStatus(
    [
      { spentOn: "2026-07-13", hours: 8 },
      { spentOn: "2026-07-14", hours: 8 },
      { spentOn: "2026-07-15", hours: 8 },
    ],
    "2026-07-13", // Mon of the current week
    wed15,
  );
  check("current week kept even if full -> planned=24", r.planned === 24, r.planned);
  check("current week kept even if full -> logged=24", r.logged === 24, r.logged);
  check("current week full -> green", r.status === "green", r.status);
}

print(`\n${total - failures}/${total} passed`);
if (failures > 0) imports.system.exit(1);
