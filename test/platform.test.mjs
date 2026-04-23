import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { detectPlatform, platformName, stateDir, statePaths, schedulerName } from '../src/platform.mjs';

test('detectPlatform returns one of the supported platforms', () => {
  const p = detectPlatform();
  assert.ok(['darwin', 'linux', 'win32'].includes(p), `unexpected platform: ${p}`);
});

test('platformName returns human-readable name', () => {
  assert.equal(platformName('darwin'), 'macOS');
  assert.equal(platformName('linux'), 'Linux');
  assert.equal(platformName('win32'), 'Windows');
});

test('stateDir returns correct macOS path', () => {
  const dir = stateDir('darwin');
  assert.ok(dir.includes('Library'));
  assert.ok(dir.includes('Application Support'));
  assert.ok(dir.endsWith('wua'));
});

test('stateDir returns correct Linux path', () => {
  const savedXdg = process.env.XDG_STATE_HOME;
  delete process.env.XDG_STATE_HOME;
  try {
    const dir = stateDir('linux');
    assert.equal(dir, path.join(os.homedir(), '.local', 'state', 'wua'));
  } finally {
    if (savedXdg) process.env.XDG_STATE_HOME = savedXdg;
  }
});

test('stateDir respects XDG_STATE_HOME on Linux', () => {
  const saved = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = '/tmp/xdg-test';
  try {
    const dir = stateDir('linux');
    assert.equal(dir, '/tmp/xdg-test/wua');
  } finally {
    if (saved) process.env.XDG_STATE_HOME = saved;
    else delete process.env.XDG_STATE_HOME;
  }
});

test('stateDir returns correct Windows path', () => {
  const saved = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
  try {
    const dir = stateDir('win32');
    assert.ok(dir.endsWith('wua'));
    assert.ok(dir.includes('AppData'));
  } finally {
    if (saved) process.env.LOCALAPPDATA = saved;
    else delete process.env.LOCALAPPDATA;
  }
});

test('statePaths returns configFile, lastRunFile, logFile under stateDir', () => {
  const p = statePaths();
  assert.ok(p.configFile.endsWith('config.json'));
  assert.ok(p.lastRunFile.endsWith('last-run.json'));
  assert.ok(p.logFile.endsWith('wua.log'));
});

test('schedulerName maps platforms correctly', () => {
  assert.equal(schedulerName('darwin'), 'launchd');
  assert.equal(schedulerName('linux'), 'systemd');
  assert.equal(schedulerName('win32'), 'schtasks');
});
