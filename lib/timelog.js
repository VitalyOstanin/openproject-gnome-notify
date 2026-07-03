// SPDX-License-Identifier: GPL-2.0-or-later
//
// Pure helper (no GNOME imports): compute the work-log status against an
// 8h/weekday plan, from a start date up to and including today.

export const DAILY_NORM_HOURS = 8;

function localDayKey(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDayKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function planFor(date) {
  const dow = date.getDay(); // 0 = Sun, 6 = Sat
  return dow === 0 || dow === 6 ? 0 : DAILY_NORM_HOURS;
}

// Local midnight of the Monday that opens the ISO week containing `date`.
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0 = Sun .. 6 = Sat
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

// entries: [{ spentOn: "YYYY-MM-DD", hours: Number }]
// startDateStr: "YYYY-MM-DD"; now: Date. Returns { logged, planned, todayDeficit, deficit, status }.
//
// Fully-filled past weeks (every weekday met the 8h norm) are discarded from the
// displayed plan/fact regardless of position; the current week is always kept.
// A discarded week has zero deficit by definition, so this affects logged/planned
// only, not deficit or status.
export function computeTimelogStatus(entries, startDateStr, now = new Date()) {
  const start = parseDayKey(startDateStr);
  const todayKey = localDayKey(now);
  const today = parseDayKey(todayKey);
  if (!start || start.getTime() > today.getTime()) {
    return { logged: 0, planned: 0, todayDeficit: 0, deficit: 0, status: "green" };
  }

  const loggedByDay = new Map();
  for (const e of entries || []) {
    const key = e && e.spentOn;
    const hours = Number(e && e.hours) || 0;
    if (!key) continue;
    loggedByDay.set(key, (loggedByDay.get(key) || 0) + hours);
  }

  const curWeekTime = mondayOf(today).getTime();

  // First pass: per-day facts plus the summed per-day shortfall of each week,
  // keyed by that week's Monday, so a week can be judged "fully filled".
  const days = [];
  const weekDeficit = new Map();
  const cur = new Date(start.getTime());
  while (cur.getTime() <= today.getTime()) {
    const key = localDayKey(cur);
    const plan = planFor(cur);
    const done = loggedByDay.get(key) || 0;
    const weekTime = mondayOf(cur).getTime();
    const dayDeficit = Math.max(0, plan - done);
    weekDeficit.set(weekTime, (weekDeficit.get(weekTime) || 0) + dayDeficit);
    days.push({ key, plan, done, weekTime, dayDeficit });
    cur.setDate(cur.getDate() + 1);
  }

  let logged = 0;
  let planned = 0;
  let todayDeficit = 0;
  // Sum of per-day shortfalls; overlog on one day never offsets another's deficit.
  let deficit = 0;
  let prevDeficit = false;

  for (const d of days) {
    const isCurrentWeek = d.weekTime === curWeekTime;
    // Discard fully-filled past weeks; the current week is always counted.
    if (!isCurrentWeek && weekDeficit.get(d.weekTime) === 0) continue;
    planned += d.plan;
    logged += d.done;
    deficit += d.dayDeficit;
    if (d.key === todayKey) {
      todayDeficit = d.dayDeficit;
    } else if (d.dayDeficit > 0) {
      prevDeficit = true;
    }
  }

  const status = prevDeficit ? "red" : todayDeficit > 0 ? "yellow" : "green";
  return { logged, planned, todayDeficit, deficit, status };
}
