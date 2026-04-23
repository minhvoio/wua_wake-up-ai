import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readConfig, resolveNodeBin, resolveWuaBin } from '../config.mjs';
import { statePaths } from '../platform.mjs';
import { getScheduler } from '../schedulers/index.mjs';
import { computeWindow, formatHour12, formatTime12 } from '../floor-to-hour.mjs';
import { success, warn, fail, info, banner } from '../render.mjs';
import fs from 'node:fs';

/**
 * `wua install` - writes the platform scheduler entry so `wua trigger` fires
 * at the configured time each day.
 *
 * UX rule: PRESENT the exact file path and command that will be written,
 * ASK for approval, then EXECUTE. Users should never be surprised by
 * what lands on their system.
 *
 * @param {{ yes?: boolean, json?: boolean }} flags
 */
export async function cmdInstall(flags = {}) {
  const cfg = readConfig();
  if (!cfg) {
    console.error(fail('No config found. Run `wua setup` first.'));
    return 2;
  }

  const { name: schedulerKind, impl } = getScheduler();
  const probe = impl.probe();
  if (!probe.available) {
    console.error(fail(`Scheduler "${schedulerKind}" is not available on this system.`));
    if (probe.notes) console.error(`  ${probe.notes}`);
    return 1;
  }

  // Build the command the scheduler will run: `node /path/to/wua.mjs trigger`.
  const nodeBin = resolveNodeBin();
  const wuaBin = resolveWuaBin();
  const triggerCommand = wuaBin === 'wua' ? ['wua', 'trigger'] : [nodeBin, wuaBin, 'trigger'];

  const { logFile, dir } = statePaths();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const target = { hour: cfg.targetHour, minute: cfg.fireMinute };
  const window = computeWindow(target.hour);

  // PRESENT
  console.log(banner());
  console.log('');
  console.log('The following will be installed:');
  console.log('');
  console.log(`  Scheduler:       ${schedulerKind}`);
  console.log(`  Fire time:       ${formatTime12(target)} daily`);
  console.log(`  Window anchor:   ${formatHour12(window.startHour)} to ${formatHour12(window.endHour)}`);
  console.log(`  Scheduler runs:  ${triggerCommand.join(' ')}`);
  console.log(`  Which fires:     ${cfg.triggerCommand.join(' ')}`);
  console.log(`  Log file:        ${logFile}`);
  console.log('');

  if (!flags.yes) {
    const rl = readline.createInterface({ input, output });
    try {
      const ans = await rl.question('Install? [Y/n]: ');
      if (/^n/i.test(ans.trim())) {
        console.log(warn('Cancelled. Nothing installed.'));
        return 0;
      }
    } finally {
      rl.close();
    }
  }

  // EXECUTE
  const result = impl.install({ target, triggerCommand, logPath: logFile });
  if (!result.ok) {
    console.error(fail(result.error || 'Install failed.'));
    if (result.entryPath) console.error(`  Entry path was: ${result.entryPath}`);
    return 1;
  }

  console.log(success(`Installed. Entry: ${result.entryPath}`));

  // Verify by reading status back.
  const s = impl.status();
  if (s.nextFireRaw) {
    console.log(info(`Next fire: ${s.nextFireRaw}`));
  }
  console.log('');
  console.log('Verify later with `wua status`. Test now with `wua trigger`.');
  return 0;
}
