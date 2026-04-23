import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Read-only probe of Claude's 5-hour window state via the undocumented
 * `GET https://api.anthropic.com/api/oauth/usage` endpoint. This endpoint
 * is passive: confirmed by multiple community tools (Claude-Code-Usage-Monitor,
 * claudeusagetracker) NOT to trigger or anchor the window.
 *
 * Returns null on any failure (missing token, network error, changed shape).
 * This is a nice-to-have, not critical, so wua must degrade gracefully.
 *
 * @returns {Promise<null | {
 *   fiveHourPercentLeft: number,
 *   fiveHourResetsAt: string,
 *   weeklyPercentLeft?: number,
 *   weeklyResetsAt?: string,
 * }>}
 */
export async function probeWindow() {
  const token = readOAuthToken();
  if (!token) return null;

  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'wua/0.1.1',
      },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return normalize(body);
  } catch {
    return null;
  }
}

function normalize(body) {
  // Schema observed in the wild:
  // { five_hour: { utilization: 33.0, resets_at: "..." },
  //   seven_day: { utilization: ..., resets_at: "..." } }
  if (!body || typeof body !== 'object') return null;
  const fh = body.five_hour;
  if (!fh) return null;
  const out = {
    fiveHourPercentLeft: typeof fh.utilization === 'number' ? Math.max(0, 100 - fh.utilization) : NaN,
    fiveHourResetsAt: String(fh.resets_at || ''),
  };
  const wk = body.seven_day || body.weekly;
  if (wk) {
    if (typeof wk.utilization === 'number') out.weeklyPercentLeft = Math.max(0, 100 - wk.utilization);
    if (wk.resets_at) out.weeklyResetsAt = String(wk.resets_at);
  }
  return out;
}

/**
 * Read the Claude Code OAuth token from the standard on-disk credential
 * location. Returns null if not found. We do NOT prompt the user to paste
 * a token and we do NOT store one of our own; we only reuse what Claude
 * Code has already persisted locally.
 */
function readOAuthToken() {
  // Claude Code stores credentials at ~/.claude/.credentials.json or similar.
  // Exact path / shape is version-dependent. We try the common locations
  // and return null on any miss. If Anthropic changes the format, this
  // function silently degrades and `wua status` skips window state.
  const home = os.homedir();
  const candidates = [
    path.join(home, '.claude', '.credentials.json'),
    path.join(home, '.claude', 'credentials.json'),
    path.join(home, '.config', 'claude', 'credentials.json'),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      const token = findToken(parsed);
      if (token) return token;
    } catch {
      // ignore and try next
    }
  }
  // Some Claude Code installs use the macOS Keychain. We do not attempt to
  // read the Keychain from wua (would require a native call or `security`
  // CLI, neither of which we want as a hard dependency for an optional
  // probe). When the token is in Keychain only, window probing is simply
  // disabled and `wua status` skips that section.
  return null;
}

function findToken(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && v.startsWith('sk-ant-oat')) return v;
    if (typeof v === 'object') {
      const nested = findToken(v);
      if (nested) return nested;
    }
  }
  return null;
}
