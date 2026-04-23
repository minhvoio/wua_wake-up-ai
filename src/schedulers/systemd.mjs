import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const UNIT_NAME = 'wua';

function unitDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'systemd', 'user');
}

function servicePath() {
  return path.join(unitDir(), `${UNIT_NAME}.service`);
}

function timerPath() {
  return path.join(unitDir(), `${UNIT_NAME}.timer`);
}

export function probe() {
  const r = spawnSync('systemctl', ['--user', '--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    return {
      available: false,
      notes:
        'systemctl --user not available. wua requires systemd user services. ' +
        'On distros without systemd (e.g. some minimal containers, Alpine), wua cannot install a schedule yet.',
    };
  }
  const firstLine = String(r.stdout || '').split('\n')[0];
  return { available: true, version: firstLine, notes: 'systemd user timer' };
}

/**
 * @param {{ target: { hour: number, minute: number }, triggerCommand: string[], logPath: string }} opts
 */
export function install({ target, triggerCommand, logPath }) {
  const dir = unitDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const service = buildService({ triggerCommand, logPath });
  const timer = buildTimer({ target });

  fs.writeFileSync(servicePath(), service, 'utf8');
  fs.writeFileSync(timerPath(), timer, 'utf8');

  // Reload and enable
  const reload = spawnSync('systemctl', ['--user', 'daemon-reload'], { encoding: 'utf8' });
  if (reload.status !== 0) {
    return {
      ok: false,
      entryPath: timerPath(),
      error: `systemctl --user daemon-reload failed: ${String(reload.stderr || '').trim()}`,
    };
  }
  const enable = spawnSync(
    'systemctl',
    ['--user', 'enable', '--now', `${UNIT_NAME}.timer`],
    { encoding: 'utf8' }
  );
  if (enable.status !== 0) {
    return {
      ok: false,
      entryPath: timerPath(),
      error: `systemctl --user enable --now ${UNIT_NAME}.timer failed: ${String(enable.stderr || '').trim()}`,
    };
  }

  // Hint for headless servers where user sessions don't persist:
  // `loginctl enable-linger <user>` keeps the user manager running after
  // logout so the timer fires even when the user is not logged in. We
  // don't run this automatically (requires root), but we'll mention it
  // in `wua doctor`.

  return { ok: true, entryPath: timerPath() };
}

export function uninstall() {
  const removed = [];
  const sp = servicePath();
  const tp = timerPath();

  spawnSync('systemctl', ['--user', 'disable', '--now', `${UNIT_NAME}.timer`], { encoding: 'utf8' });
  spawnSync('systemctl', ['--user', 'stop', `${UNIT_NAME}.service`], { encoding: 'utf8' });

  if (fs.existsSync(sp)) {
    fs.unlinkSync(sp);
    removed.push(sp);
  }
  if (fs.existsSync(tp)) {
    fs.unlinkSync(tp);
    removed.push(tp);
  }

  spawnSync('systemctl', ['--user', 'daemon-reload'], { encoding: 'utf8' });

  return { ok: true, removed };
}

export function status() {
  const tp = timerPath();
  const installed = fs.existsSync(tp);
  const out = { installed, entryPath: tp };
  if (!installed) return out;

  const list = spawnSync(
    'systemctl',
    ['--user', 'list-timers', `${UNIT_NAME}.timer`, '--no-legend', '--no-pager'],
    { encoding: 'utf8' }
  );
  if (list.status === 0) {
    out.raw = String(list.stdout || '').trim();
    // Format: "NEXT LEFT LAST PASSED UNIT ACTIVATES"
    const firstLine = out.raw.split('\n')[0];
    if (firstLine) {
      const parts = firstLine.split(/\s{2,}/);
      if (parts.length >= 1) out.nextFireRaw = parts[0];
    }
  }

  const show = spawnSync('systemctl', ['--user', 'is-active', `${UNIT_NAME}.timer`], { encoding: 'utf8' });
  out.activeState = String(show.stdout || '').trim();

  return out;
}

function buildService({ triggerCommand, logPath }) {
  // ExecStart needs each arg quoted. Shell-escape defensively.
  const execCmd = triggerCommand.map(shellQuote).join(' ');
  return `[Unit]
Description=wua - Wake Up AI (fires Claude trigger to anchor 5h window)
Documentation=https://github.com/minhvoio/wua_wake-up-ai

[Service]
Type=oneshot
ExecStart=${execCmd}
StandardOutput=append:${logPath}
StandardError=append:${logPath}
`;
}

function buildTimer({ target }) {
  const hh = String(target.hour).padStart(2, '0');
  const mm = String(target.minute).padStart(2, '0');
  return `[Unit]
Description=wua timer - fires daily at ${hh}:${mm} to anchor Claude's 5-hour window
Documentation=https://github.com/minhvoio/wua_wake-up-ai

[Timer]
OnCalendar=*-*-* ${hh}:${mm}:00
Persistent=true
Unit=${UNIT_NAME}.service

[Install]
WantedBy=timers.target
`;
}

function shellQuote(s) {
  if (/^[A-Za-z0-9_\-./=:,@]+$/.test(s)) return s;
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export const __test__ = { buildService, buildTimer, servicePath, timerPath };
