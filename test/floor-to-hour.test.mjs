import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFireTime,
  computeWindow,
  formatHour12,
  formatTime12,
  nextFireDate,
} from '../src/floor-to-hour.mjs';

test('computeFireTime defaults to :15 of the target hour', () => {
  assert.deepEqual(computeFireTime(8), { hour: 8, minute: 15 });
});

test('computeFireTime accepts custom minute', () => {
  assert.deepEqual(computeFireTime(9, 45), { hour: 9, minute: 45 });
});

test('computeFireTime rejects invalid hour', () => {
  assert.throws(() => computeFireTime(24));
  assert.throws(() => computeFireTime(-1));
  assert.throws(() => computeFireTime(7.5));
});

test('computeFireTime rejects invalid minute', () => {
  assert.throws(() => computeFireTime(8, 60));
  assert.throws(() => computeFireTime(8, -5));
});

test('computeWindow returns 5h span from the fire hour', () => {
  assert.deepEqual(computeWindow(8), { startHour: 8, endHour: 13 });
  assert.deepEqual(computeWindow(9), { startHour: 9, endHour: 14 });
});

test('computeWindow wraps past midnight', () => {
  assert.deepEqual(computeWindow(20), { startHour: 20, endHour: 1 });
  assert.deepEqual(computeWindow(23), { startHour: 23, endHour: 4 });
});

test('formatHour12 converts 24h to 12h with AM/PM', () => {
  assert.equal(formatHour12(0), '12 AM');
  assert.equal(formatHour12(1), '1 AM');
  assert.equal(formatHour12(12), '12 PM');
  assert.equal(formatHour12(13), '1 PM');
  assert.equal(formatHour12(23), '11 PM');
});

test('formatTime12 includes minutes', () => {
  assert.equal(formatTime12({ hour: 8, minute: 15 }), '8:15 AM');
  assert.equal(formatTime12({ hour: 13, minute: 5 }), '1:05 PM');
  assert.equal(formatTime12({ hour: 0, minute: 0 }), '12:00 AM');
});

test('nextFireDate returns today if fire time is in the future', () => {
  const now = new Date('2026-04-23T06:00:00');
  const result = nextFireDate({ hour: 8, minute: 15 }, now);
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 3);
  assert.equal(result.getDate(), 23);
  assert.equal(result.getHours(), 8);
  assert.equal(result.getMinutes(), 15);
});

test('nextFireDate returns tomorrow if fire time has passed today', () => {
  const now = new Date('2026-04-23T10:00:00');
  const result = nextFireDate({ hour: 8, minute: 15 }, now);
  assert.equal(result.getDate(), 24);
  assert.equal(result.getHours(), 8);
});

test('nextFireDate rolls to tomorrow when fire time equals now', () => {
  const now = new Date('2026-04-23T08:15:00');
  const result = nextFireDate({ hour: 8, minute: 15 }, now);
  assert.equal(result.getDate(), 24);
});
