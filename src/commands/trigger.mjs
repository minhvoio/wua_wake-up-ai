import { spawn } from 'node:child_process';
import { readConfig, writeLastRun, appendLog } from '../config.mjs';

/**
 * `wua trigger` - execute the configured trigger command and log the result.
 * This is what the scheduler calls. It is also what the user can run manually
 * to test the setup.
 *
 * Exit codes:
 *   0 = trigger command succeeded OR returned a rate-limit (still anchors window)
 *   1 = trigger command failed for a real reason (cli not found, auth error, etc.)
 *   2 = no config, run `wua setup` first
 */
export async function cmdTrigger() {
  const cfg = readConfig();
  if (!cfg) {
    console.error('No wua config found. Run `wua setup` first.');
    return 2;
  }

  const [bin, ...args] = cfg.triggerCommand;
  if (!bin) {
    console.error('Config has empty triggerCommand.');
    return 2;
  }

  const startedAt = new Date().toISOString();
  appendLog(`[${startedAt}] fire start: ${bin} ${args.join(' ')}`);

  let stdout = '';
  let stderr = '';
  const exitCode = await new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      stderr += `spawn error: ${err.message}\n`;
      resolve(127);
    });
    child.on('close', (code) => resolve(code == null ? 1 : code));
  });

  // Rate limit is still a successful anchor (the request reached Anthropic).
  const rateLimited =
    /rate\s*limit|usage\s*limit|quota/i.test(stdout) || /rate\s*limit|usage\s*limit|quota/i.test(stderr);
  const finalExit = exitCode !== 0 && rateLimited ? 0 : exitCode;

  const endedAt = new Date().toISOString();
  writeLastRun({
    at: startedAt,
    endedAt,
    exitCode: finalExit,
    stdout: stdout.slice(-4000),
    stderr: stderr.slice(-4000),
    command: cfg.triggerCommand,
    rateLimited,
  });
  appendLog(
    `[${endedAt}] fire end: exit=${finalExit}${rateLimited ? ' (rate-limited, still anchored)' : ''}`
  );

  // Surface the tail of output so scheduler logs are useful.
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  return finalExit;
}
