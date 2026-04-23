import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const LABEL = 'com.minagents.wua';

function plistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
}

export function probe() {
  // launchctl is always present on macOS.
  const result = spawnSync('launchctl', ['help'], { encoding: 'utf8' });
  return {
    available: result.status === 0 || result.status === 1, // `help` returns 1 on some versions
    notes: 'launchd (per-user LaunchAgent)',
  };
}

/**
 * @param {{ target: { hour: number, minute: number }, triggerCommand: string[], logPath: string }} opts
 */
export function install({ target, triggerCommand, logPath }) {
  const plist = buildPlist({ target, triggerCommand, logPath });
  const p = plistPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, plist, 'utf8');

  // Try modern `bootstrap` first, fall back to `load` for older macOS.
  const uid = process.getuid ? process.getuid() : null;
  let loadOk = false;
  let loadErr = '';
  if (uid != null) {
    const r = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, p], { encoding: 'utf8' });
    if (r.status === 0) {
      loadOk = true;
    } else {
      loadErr = String(r.stderr || r.stdout || '').trim();
      // If it's already loaded, bootout then bootstrap again
      if (/Service.*already loaded|already bootstrapped/i.test(loadErr)) {
        spawnSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { encoding: 'utf8' });
        const r2 = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, p], { encoding: 'utf8' });
        loadOk = r2.status === 0;
        if (!loadOk) loadErr = String(r2.stderr || r2.stdout || '').trim();
      }
    }
  }

  if (!loadOk) {
    const fallback = spawnSync('launchctl', ['load', '-w', p], { encoding: 'utf8' });
    loadOk = fallback.status === 0;
    if (!loadOk) {
      return {
        ok: false,
        entryPath: p,
        error: `launchctl failed to load ${p}. Modern: ${loadErr}. Fallback: ${String(fallback.stderr || '').trim()}`,
      };
    }
  }

  return { ok: true, entryPath: p };
}

export function uninstall() {
  const p = plistPath();
  const removed = [];
  const uid = process.getuid ? process.getuid() : null;

  if (fs.existsSync(p)) {
    if (uid != null) {
      spawnSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { encoding: 'utf8' });
    }
    spawnSync('launchctl', ['unload', p], { encoding: 'utf8' });
    fs.unlinkSync(p);
    removed.push(p);
  }
  return { ok: true, removed };
}

export function status() {
  const p = plistPath();
  const installed = fs.existsSync(p);
  const out = { installed, entryPath: p };
  if (!installed) return out;

  const uid = process.getuid ? process.getuid() : null;
  if (uid != null) {
    const r = spawnSync('launchctl', ['print', `gui/${uid}/${LABEL}`], { encoding: 'utf8' });
    if (r.status === 0) {
      out.raw = String(r.stdout || '').slice(0, 4000);
      const match = String(r.stdout).match(/next scheduled runtime\s*=\s*(.+)/i);
      if (match) out.nextFireRaw = match[1].trim();
    }
  }
  return out;
}

function buildPlist({ target, triggerCommand, logPath }) {
  const args = triggerCommand.map((a) => `        <string>${escapeXml(a)}</string>`).join('\n');
  const hour = target.hour;
  const minute = target.minute;
  const logEsc = escapeXml(logPath);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
${args}
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${hour}</integer>
        <key>Minute</key>
        <integer>${minute}</integer>
    </dict>

    <key>RunAtLoad</key>
    <false/>

    <key>StandardOutPath</key>
    <string>${logEsc}</string>
    <key>StandardErrorPath</key>
    <string>${logEsc}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Exported for tests.
export const __test__ = { buildPlist, plistPath };
