import { spawnSync } from 'node:child_process';

/**
 * Probe whether the `claude` CLI is installed and on PATH.
 *
 * @returns {{ installed: boolean, version?: string, path?: string, error?: string }}
 */
export function checkClaude() {
  // `claude --version` is fast and doesn't touch the network.
  const result = spawnSync('claude', ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
  });

  if (result.error && result.error.code === 'ENOENT') {
    return {
      installed: false,
      error:
        'The `claude` CLI was not found on PATH. Install Claude Code from ' +
        'https://docs.claude.com/en/docs/claude-code/setup then re-run `wua setup`.',
    };
  }

  if (result.status !== 0) {
    return {
      installed: false,
      error: `\`claude --version\` exited with code ${result.status}. stderr: ${String(result.stderr).trim()}`,
    };
  }

  const version = String(result.stdout || '').trim();
  return {
    installed: true,
    version: version || 'unknown',
  };
}

/**
 * Find the absolute path to the `claude` binary on PATH (posix: `which`,
 * windows: `where`). Returns null if not found. Used when writing scheduler
 * entries so we can hardcode the absolute path rather than rely on the
 * scheduler's minimal PATH.
 */
export function resolveClaudeBin() {
  const platform = process.platform;
  const cmd = platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(cmd, ['claude'], { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) return null;
  const firstLine = String(result.stdout || '').split(/\r?\n/)[0].trim();
  return firstLine.length > 0 ? firstLine : null;
}
