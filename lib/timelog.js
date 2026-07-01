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

// entries: [{ spentOn: "YYYY-MM-DD", hours: Number }]
// startDateStr: "YYYY-MM-DD"; now: Date. Returns { logged, planned, todayDeficit, status }.
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

  let logged = 0;
  let planned = 0;
  let todayDeficit = 0;
  // Sum of per-day shortfalls; overlog on one day never offsets another's deficit.
  let deficit = 0;
  let prevDeficit = false;

  const cur = new Date(start.getTime());
  while (cur.getTime() <= today.getTime()) {
    const key = localDayKey(cur);
    const plan = planFor(cur);
    const done = loggedByDay.get(key) || 0;
    planned += plan;
    logged += done;
    const dayDeficit = Math.max(0, plan - done);
    deficit += dayDeficit;
    if (key === todayKey) {
      todayDeficit = dayDeficit;
    } else if (dayDeficit > 0) {
      prevDeficit = true;
    }
    cur.setDate(cur.getDate() + 1);
  }

  const status = prevDeficit ? "red" : todayDeficit > 0 ? "yellow" : "green";
  return { logged, planned, todayDeficit, deficit, status };
}
