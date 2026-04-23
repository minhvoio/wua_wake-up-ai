// Pure functions for window math.
//
// The core fact: Claude's 5-hour usage window is anchored to the clock hour
// of the first message after the prior window expires. Community-observed,
// corroborated by multiple tools including vdsmon/claude-warmup.
//
// - Message at 6:15 AM  -> window runs 6:00 AM to 11:00 AM
// - Message at 7:45 AM  -> window runs 7:00 AM to 12:00 PM
//
// So to GET a window starting at 8:00 AM, the trigger can fire ANY time
// between 8:00:00 and 8:59:59 ... but firing at exactly 8:00:00 is risky
// (clock drift, machine still waking up). Default: fire 15 min AFTER the
// top of the target hour so we're solidly inside the hour bucket but not
// too late for the user who starts at :00.
//
// Wait: re-reading the rule. If fire is at 8:15, floor -> 8:00.
// If target-start-of-window = 8:00, fire must be in [8:00, 8:59].
// So we fire at 8:15 to get an 8:00-13:00 window. Correct.
//
// But the user's "I want to START work at 8am" implies they want the window
// ALREADY RUNNING at 8:00. That means the trigger must fire BEFORE 8:00 to
// anchor to the 7:00 bucket (7:00-12:00) OR the user must accept that the
// window starts the moment they arrive.
//
// The right interpretation is "align the window to your workday". Two modes:
//
// 1. "start-of-work" mode (default): user says "I work 8 AM to 5 PM".
//    wua fires AT 8:15 AM so the 5-hour window runs 8:00 AM to 1:00 PM,
//    covering the first half of the workday. For the afternoon, a second
//    fire at 1:15 PM covers 1:00 PM to 6:00 PM. (v0.1.0 does one fire only;
//    two-fire mode is v0.2.0.)
//
// 2. "pre-warm" mode (future): user says "I work 8 AM to 5 PM and I want
//    the window already running when I sit down". wua fires at 7:15 AM
//    so the 5h window runs 7:00 AM to 12:00 PM. Then a second fire at
//    12:15 PM covers 12:00 PM to 5:00 PM. Both modes assume ~10 hours of
//    work which needs two fires.
//
// v0.1.0: single fire, "start-of-work" mode. User picks the hour the
// window should START. wua fires at hour:15.

/**
 * Compute the fire time that anchors the 5h window to start at targetHour:00.
 *
 * @param {number} targetHour - 0..23, the hour the user wants the window to START
 * @param {number} fireMinute - 0..59, minute within that hour to fire (default 15)
 * @returns {{ hour: number, minute: number }}
 */
export function computeFireTime(targetHour, fireMinute = 15) {
  assertHour(targetHour);
  assertMinute(fireMinute);
  return { hour: targetHour, minute: fireMinute };
}

/**
 * Compute the 5-hour window range that will be anchored given a fire time.
 *
 * @param {number} fireHour - 0..23
 * @returns {{ startHour: number, endHour: number }}
 */
export function computeWindow(fireHour) {
  assertHour(fireHour);
  const startHour = fireHour; // floors to clock hour
  const endHour = (startHour + 5) % 24;
  return { startHour, endHour };
}

/**
 * Format hour as 12h clock string, e.g. 8 -> "8 AM", 13 -> "1 PM".
 *
 * @param {number} hour - 0..23
 * @returns {string}
 */
export function formatHour12(hour) {
  assertHour(hour);
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${ampm}`;
}

/**
 * Format a {hour, minute} as 12h clock string, e.g. {8,15} -> "8:15 AM".
 *
 * @param {{ hour: number, minute: number }} t
 * @returns {string}
 */
export function formatTime12(t) {
  assertHour(t.hour);
  assertMinute(t.minute);
  const ampm = t.hour < 12 ? 'AM' : 'PM';
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  const mm = String(t.minute).padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
}

/**
 * Given a fire time today in local time, compute the next fire Date.
 * If the fire time has already passed today, returns tomorrow's fire time.
 *
 * @param {{ hour: number, minute: number }} fireTime
 * @param {Date} [now] - for testing
 * @returns {Date}
 */
export function nextFireDate(fireTime, now = new Date()) {
  assertHour(fireTime.hour);
  assertMinute(fireTime.minute);
  const next = new Date(now);
  next.setHours(fireTime.hour, fireTime.minute, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function assertHour(h) {
  if (!Number.isInteger(h) || h < 0 || h > 23) {
    throw new Error(`Invalid hour ${h}: must be integer 0..23`);
  }
}

function assertMinute(m) {
  if (!Number.isInteger(m) || m < 0 || m > 59) {
    throw new Error(`Invalid minute ${m}: must be integer 0..59`);
  }
}
