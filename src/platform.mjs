import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

/**
 * @typedef {'darwin' | 'linux' | 'win32'} SupportedPlatform
 */

/**
 * Detect the current platform. Throws if unsupported.
 * @returns {SupportedPlatform}
 */
export function detectPlatform() {
  const p = process.platform;
  if (p === 'darwin' || p === 'linux' || p === 'win32') return p;
  throw new Error(
    `wua does not support platform "${p}". Supported: macOS (darwin), Linux, Windows (win32).`
  );
}

/**
 * Return the human-readable name for display.
 */
export function platformName(p = detectPlatform()) {
  if (p === 'darwin') return 'macOS';
  if (p === 'linux') return 'Linux';
  if (p === 'win32') return 'Windows';
  return p;
}

/**
 * Return the user-local state directory. Creates it lazily on write.
 */
export function stateDir(p = detectPlatform()) {
  const home = os.homedir();
  if (p === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'wua');
  }
  if (p === 'linux') {
    const xdg = process.env.XDG_STATE_HOME;
    return path.join(xdg && xdg.length > 0 ? xdg : path.join(home, '.local', 'state'), 'wua');
  }
  if (p === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return path.join(local, 'wua');
  }
  return path.join(home, '.wua');
}

/**
 * Return paths to the standard state files.
 */
export function statePaths(p = detectPlatform()) {
  const dir = stateDir(p);
  return {
    dir,
    configFile: path.join(dir, 'config.json'),
    lastRunFile: path.join(dir, 'last-run.json'),
    logFile: path.join(dir, 'wua.log'),
  };
}

/**
 * Return the scheduler adapter name for this platform.
 * @returns {'launchd' | 'systemd' | 'schtasks'}
 */
export function schedulerName(p = detectPlatform()) {
  if (p === 'darwin') return 'launchd';
  if (p === 'linux') return 'systemd';
  if (p === 'win32') return 'schtasks';
  throw new Error(`No scheduler for platform ${p}`);
}
