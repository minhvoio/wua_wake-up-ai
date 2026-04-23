import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const TASK_NAME = 'wua';

export function probe() {
  const r = spawnSync('schtasks.exe', ['/Query', '/?'], { encoding: 'utf8' });
  if (r.error || (r.status !== 0 && r.status !== 1)) {
    return {
      available: false,
      notes: 'schtasks.exe not found. wua on Windows requires Task Scheduler.',
    };
  }
  return { available: true, notes: 'Windows Task Scheduler' };
}

/**
 * @param {{ target: { hour: number, minute: number }, triggerCommand: string[], logPath: string }} opts
 */
export function install({ target, triggerCommand, logPath }) {
  const xml = buildTaskXml({ target, triggerCommand, logPath });
  const tmpDir = os.tmpdir();
  const xmlPath = path.join(tmpDir, `wua-task-${process.pid}.xml`);
  // schtasks.exe /XML requires UTF-16 LE with a BOM. Node's 'utf16le'
  // encoding does NOT write a BOM by default, so we prepend it manually.
  const bom = Buffer.from([0xff, 0xfe]);
  const body = Buffer.from(xml, 'utf16le');
  fs.writeFileSync(xmlPath, Buffer.concat([bom, body]));

  const args = ['/Create', '/TN', TASK_NAME, '/XML', xmlPath, '/F'];
  const r = spawnSync('schtasks.exe', args, { encoding: 'utf8' });

  try {
    fs.unlinkSync(xmlPath);
  } catch {
    // leave tmp file if we can't delete
  }

  if (r.status !== 0) {
    return {
      ok: false,
      entryPath: `Task Scheduler: ${TASK_NAME}`,
      error: `schtasks /Create failed: ${String(r.stderr || r.stdout || '').trim()}`,
    };
  }

  return { ok: true, entryPath: `Task Scheduler: ${TASK_NAME}` };
}

export function uninstall() {
  const r = spawnSync('schtasks.exe', ['/Delete', '/TN', TASK_NAME, '/F'], { encoding: 'utf8' });
  // Exit 1 = task didn't exist, treat as success for uninstall
  const ok = r.status === 0 || /does not exist/i.test(String(r.stderr || r.stdout || ''));
  return {
    ok,
    removed: r.status === 0 ? [`Task Scheduler: ${TASK_NAME}`] : [],
    error: ok ? undefined : String(r.stderr || r.stdout || '').trim(),
  };
}

export function status() {
  const q = spawnSync('schtasks.exe', ['/Query', '/TN', TASK_NAME, '/V', '/FO', 'LIST'], {
    encoding: 'utf8',
  });
  if (q.status !== 0) {
    return { installed: false, entryPath: `Task Scheduler: ${TASK_NAME}` };
  }
  const raw = String(q.stdout || '');
  const out = {
    installed: true,
    entryPath: `Task Scheduler: ${TASK_NAME}`,
    raw: raw.slice(0, 4000),
  };
  const m = raw.match(/Next Run Time:\s*(.+)/i);
  if (m) out.nextFireRaw = m[1].trim();
  return out;
}

function buildTaskXml({ target, triggerCommand, logPath }) {
  // Task Scheduler XML schema. `StartBoundary` needs a full ISO-like date
  // but Windows only cares about the time portion for a DailyTrigger.
  const hh = String(target.hour).padStart(2, '0');
  const mm = String(target.minute).padStart(2, '0');
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  const startBoundary = `${dateStr}T${hh}:${mm}:00`;
  const user = process.env.USERNAME || os.userInfo().username;

  const command = triggerCommand[0];
  const args = triggerCommand
    .slice(1)
    .map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
    .join(' ');

  // Redirect stdout/stderr via cmd.exe so logging still works in Task Scheduler.
  const wrappedCommand = 'cmd.exe';
  const wrappedArgs = `/c ${quoteForCmd(command)} ${args} >> ${quoteForCmd(logPath)} 2>&1`;

  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>wua - Wake Up AI. Fires Claude trigger to anchor 5h window at ${hh}:${mm} local time.</Description>
    <URI>\\${TASK_NAME}</URI>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${escapeXml(startBoundary)}</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${escapeXml(user)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(wrappedCommand)}</Command>
      <Arguments>${escapeXml(wrappedArgs)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

function quoteForCmd(s) {
  if (/[\s"&|<>^]/.test(s)) return `"${String(s).replace(/"/g, '""')}"`;
  return s;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const __test__ = { buildTaskXml };
