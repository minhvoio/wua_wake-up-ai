import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readConfig, writeLastRun, appendLog } from '../config.mjs';
import { computeWindow, formatHour12 } from '../floor-to-hour.mjs';
import { banner, warn } from '../render.mjs';

/**
 * `wua trigger` - execute the configured trigger command and log the result.
 * This is what the scheduler calls. It is also what the user can run manually
 * to test the setup.
 *
 * When run interactively (TTY), we show PRESENT + ASK before firing because
 * this is an observable action: it hits the Claude API and anchors the 5h
 * window to the current clock hour. If the user runs `wua trigger` at 11:47
 * PM to "test", they just anchored their window to 11 PM - 4 AM. Users must
 * see that consequence before the fire happens.
 *
 * When called non-interactively (from launchd/systemd/schtasks), we fire
 * immediately. Scheduler invocation IS the point; no gate needed.
 *
 * Exit codes:
 *   0 = trigger command succeeded OR returned a rate-limit (still anchors window)
 *   1 = trigger command failed for a real reason (cli not found, auth error, etc.)
 *   2 = no config, run `wua setup` first
 *   3 = user cancelled at interactive prompt
 *
 * @param {{ yes?: boolean }} flags
 */
export async function cmdTrigger(flags = {}) {
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

  // PRESENT + ASK when interactive (TTY attached, not called from scheduler)
  const interactive = process.stdin.isTTY && !flags.yes;
  if (interactive) {
    const now = new Date();
    const currentHour = now.getHours();
    const window = computeWindow(currentHour);
    console.log(banner());
    console.log('');
    console.log('About to fire the anchor message:');
    console.log('');
    console.log(`  Command:       ${cfg.triggerCommand.join(' ')}`);
    console.log(`  Current time:  ${now.toLocaleTimeString()}`);
    console.log(
      `  Window effect: anchors your 5-hour Claude window to ${formatHour12(window.startHour)} - ${formatHour12(window.endHour)}`
    );
    console.log(`  Cost:          under $0.001 (one Haiku message, no tools)`);
    console.log('');
    console.log(
      warn(
        `Firing NOW will override any previously-anchored window for today. Only do this to test.`
      )
    );
    console.log('');

    const rl = readline.createInterface({ input, output });
    try {
      const ans = await rl.question('Fire? [y/N]: ');
      if (!/^y/i.test(ans.trim())) {
        console.log('Cancelled. No fire.');
        return 3;
      }
    } finally {
      rl.close();
    }
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
