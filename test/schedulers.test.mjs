import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __test__ as launchdTest } from '../src/schedulers/launchd.mjs';
import { __test__ as systemdTest } from '../src/schedulers/systemd.mjs';
import { __test__ as schtasksTest } from '../src/schedulers/schtasks.mjs';

// --- launchd ---

test('launchd plist contains Hour and Minute from target', () => {
  const plist = launchdTest.buildPlist({
    target: { hour: 7, minute: 15 },
    triggerCommand: ['/usr/local/bin/node', '/opt/wua/bin/wua.mjs', 'trigger'],
    logPath: '/Users/test/Library/Application Support/wua/wua.log',
  });
  assert.ok(plist.includes('<key>Label</key>'));
  assert.ok(plist.includes('<string>com.minagents.wua</string>'));
  assert.ok(plist.includes('<key>Hour</key>'));
  assert.ok(plist.includes('<integer>7</integer>'));
  assert.ok(plist.includes('<key>Minute</key>'));
  assert.ok(plist.includes('<integer>15</integer>'));
  assert.ok(plist.includes('/usr/local/bin/node'));
  assert.ok(plist.includes('trigger'));
  assert.ok(plist.includes('wua.log'));
});

test('launchd plist escapes XML special chars in args', () => {
  const plist = launchdTest.buildPlist({
    target: { hour: 0, minute: 0 },
    triggerCommand: ['node', '--max-old-space-size=512', '/weird "path"/wua.mjs', 'trigger'],
    logPath: '/tmp/wua.log',
  });
  assert.ok(plist.includes('&quot;path&quot;'));
  assert.ok(!plist.includes('"path"'));
});

// --- systemd ---

test('systemd timer unit contains OnCalendar in HH:MM:00 format', () => {
  const timer = systemdTest.buildTimer({ target: { hour: 8, minute: 15 } });
  assert.ok(timer.includes('OnCalendar=*-*-* 08:15:00'));
  assert.ok(timer.includes('Persistent=true'));
  assert.ok(timer.includes('WantedBy=timers.target'));
});

test('systemd timer pads single-digit hour/minute', () => {
  const timer = systemdTest.buildTimer({ target: { hour: 6, minute: 5 } });
  assert.ok(timer.includes('06:05:00'));
});

test('systemd service contains ExecStart with all trigger args', () => {
  const service = systemdTest.buildService({
    triggerCommand: ['/usr/bin/node', '/opt/wua/bin/wua.mjs', 'trigger'],
    logPath: '/home/test/.local/state/wua/wua.log',
  });
  assert.ok(service.includes('ExecStart=/usr/bin/node /opt/wua/bin/wua.mjs trigger'));
  assert.ok(service.includes('StandardOutput=append:/home/test/.local/state/wua/wua.log'));
  assert.ok(service.includes('Type=oneshot'));
});

test('systemd service shell-quotes args with spaces', () => {
  const service = systemdTest.buildService({
    triggerCommand: ['/usr/bin/node', '/opt/wua spaces/bin/wua.mjs', 'trigger'],
    logPath: '/tmp/wua.log',
  });
  assert.ok(service.includes('"/opt/wua spaces/bin/wua.mjs"'));
});

// --- schtasks ---

test('schtasks XML contains StartBoundary with HH:MM', () => {
  const xml = schtasksTest.buildTaskXml({
    target: { hour: 8, minute: 15 },
    triggerCommand: ['node.exe', 'C:\\wua\\wua.mjs', 'trigger'],
    logPath: 'C:\\Users\\test\\AppData\\Local\\wua\\wua.log',
  });
  assert.ok(xml.includes('T08:15:00'));
  assert.ok(xml.includes('<ScheduleByDay>'));
  assert.ok(xml.includes('<DaysInterval>1</DaysInterval>'));
  assert.ok(xml.includes('<WakeToRun>true</WakeToRun>'));
  assert.ok(xml.includes('cmd.exe'));
});

test('schtasks XML wraps the command through cmd.exe for log redirection', () => {
  const xml = schtasksTest.buildTaskXml({
    target: { hour: 9, minute: 0 },
    triggerCommand: ['node.exe', 'C:\\wua\\wua.mjs', 'trigger'],
    logPath: 'C:\\logs\\wua.log',
  });
  assert.ok(xml.includes('<Command>cmd.exe</Command>'));
  assert.ok(xml.includes('&gt;&gt;'));
  assert.ok(xml.includes('2&gt;&amp;1'));
});
