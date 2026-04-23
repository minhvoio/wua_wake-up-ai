import fs from 'node:fs';
import path from 'node:path';
import { statePaths } from './platform.mjs';

/**
 * @typedef {Object} WuaConfig
 * @property {number} version - config schema version
 * @property {string} assistant - "claude" for now (future: "codex")
 * @property {number} targetHour - 0..23, hour the 5h window should start
 * @property {number} fireMinute - 0..59, minute within target hour to fire (default 15)
 * @property {string[]} triggerCommand - the argv the scheduler will run, e.g. ["claude","-p","hi",...]
 * @property {boolean} probeWindow - whether `wua status` also calls /api/oauth/usage (optional)
 * @property {string} createdAt - ISO 8601
 */

/** @type {WuaConfig} */
export const DEFAULT_CONFIG = {
  version: 1,
  assistant: 'claude',
  targetHour: 9,
  fireMinute: 15,
  triggerCommand: ['claude', '-p', 'hi', '--model', 'haiku', '--no-session-persistence'],
  probeWindow: false,
  createdAt: new Date().toISOString(),
};

export function configExists() {
  const { configFile } = statePaths();
  return fs.existsSync(configFile);
}

export function readConfig() {
  const { configFile } = statePaths();
  if (!fs.existsSync(configFile)) {
    return null;
  }
  const raw = fs.readFileSync(configFile, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    throw new Error(`Config file at ${configFile} is not valid JSON: ${err.message}`);
  }
}

/**
 * @param {WuaConfig} config
 */
export function writeConfig(config) {
  const { dir, configFile } = statePaths();
  ensureDir(dir);
  const toWrite = { ...config, version: 1 };
  fs.writeFileSync(configFile, JSON.stringify(toWrite, null, 2) + '\n', 'utf8');
  return configFile;
}

/**
 * Write a record of the last `wua trigger` run.
 * @param {{ at: string, exitCode: number, stdout: string, stderr: string, command: string[] }} result
 */
export function writeLastRun(result) {
  const { dir, lastRunFile } = statePaths();
  ensureDir(dir);
  fs.writeFileSync(lastRunFile, JSON.stringify(result, null, 2) + '\n', 'utf8');
  return lastRunFile;
}

export function readLastRun() {
  const { lastRunFile } = statePaths();
  if (!fs.existsSync(lastRunFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(lastRunFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Append a line to the fire log. Each line is an ISO timestamp and exit code.
 */
export function appendLog(line) {
  const { dir, logFile } = statePaths();
  ensureDir(dir);
  fs.appendFileSync(logFile, line.replace(/\n$/, '') + '\n', 'utf8');
}

export function tailLog(n = 20) {
  const { logFile } = statePaths();
  if (!fs.existsSync(logFile)) return [];
  const content = fs.readFileSync(logFile, 'utf8');
  const lines = content.split('\n').filter((l) => l.length > 0);
  return lines.slice(-n);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Return the path the user's `wua` binary is installed at.
 * Used when building the scheduler entry so it calls the right CLI.
 *
 * Preference order:
 *   1. process.env.WUA_BIN (explicit override for testing)
 *   2. process.argv[1] if it exists on disk (how the user invoked it right now)
 *   3. fallback to `wua` on PATH (the scheduler will resolve it)
 */
export function resolveWuaBin() {
  if (process.env.WUA_BIN) return process.env.WUA_BIN;
  const argv1 = process.argv[1];
  if (argv1) {
    try {
      const real = fs.realpathSync(argv1);
      if (real && fs.existsSync(real)) return real;
    } catch {
      // fall through
    }
  }
  return 'wua';
}

/**
 * Return the absolute path to the current Node.js binary so the scheduler
 * can invoke it directly. Using `process.execPath` sidesteps PATH issues
 * in launchd/systemd/Task Scheduler environments.
 */
export function resolveNodeBin() {
  return process.execPath;
}
