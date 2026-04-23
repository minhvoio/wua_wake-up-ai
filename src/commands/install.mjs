import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';
import { readConfig, resolveNodeBin, resolveWuaBin } from '../config.mjs';
import { statePaths } from '../platform.mjs';
import { getScheduler } from '../schedulers/index.mjs';
import { computeWindow, formatHour12, formatTime12 } from '../floor-to-hour.mjs';
import { success, warn, fail, info, banner } from '../render.mjs';

/**
 * `wua install` - writes the platform scheduler entry so `wua trigger` fires
 * at the configured time each day.
 *
 * UX rule: PRESENT the exact file path and command that will be written,
 * offer partial-choice ASK, EXECUTE only approved action, then VERIFY the
 * scheduler actually loaded (not just that the file was written).
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
  console.log('Plan:');
  console.log('');
  console.log(`  Scheduler:       ${schedulerKind}`);
  console.log(`  Fire time:       ${formatTime12(target)} daily`);
  console.log(`  Window anchor:   ${formatHour12(window.startHour)} to ${formatHour12(window.endHour)}`);
  console.log(`  Scheduler runs:  ${triggerCommand.join(' ')}`);
  console.log(`  Which fires:     ${cfg.triggerCommand.join(' ')}`);
  console.log(`  Log file:        ${logFile}`);
  console.log('');
  console.log('Impact:');
  console.log(`  Cost:            one Haiku message per day, under $0.001 per fire`);
  console.log(`  Yearly estimate: under $0.36/year`);
  console.log(
    `  Effect:          your 5-hour Claude window will anchor to ${formatHour12(window.startHour)} - ${formatHour12(window.endHour)} every day`
  );
  console.log('');

  // ASK - partial choices, not just Y/n
  let action = 'install';
  if (!flags.yes) {
    const rl = readline.createInterface({ input, output });
    try {
      console.log('Options:');
      console.log('  1. Install now (recommended)');
      console.log('  2. Dry-run (show the plan only, do not load scheduler)');
      console.log('  3. Cancel');
      console.log('');
      const ans = await rl.question('Choice [1/2/3, default 1]: ');
      const t = ans.trim();
      if (t === '2') action = 'dryrun';
      else if (t === '3' || /^n/i.test(t)) action = 'cancel';
    } finally {
      rl.close();
    }
  }

  if (action === 'cancel') {
    console.log(warn('Cancelled. Nothing installed.'));
    return 0;
  }

  if (action === 'dryrun') {
    console.log(info('Dry-run: no scheduler entry written. The plan above shows exactly what install would do.'));
    console.log(info('Run `wua install` again and choose 1 to actually install.'));
    return 0;
  }

  // EXECUTE
  const result = impl.install({ target, triggerCommand, logPath: logFile });
  if (!result.ok) {
    console.error(fail(result.error || 'Install failed.'));
    if (result.entryPath) console.error(`  Entry path was: ${result.entryPath}`);
    return 1;
  }

  console.log(success(`Installed. Entry: ${result.entryPath}`));

  // VERIFY - read status back and confirm installed=true
  const s = impl.status();
  if (!s.installed) {
    console.log(
      warn(
        `Scheduler file was written but the system did not report it as installed. ` +
          `Run \`wua doctor\` to investigate.`
      )
    );
    return 1;
  }

  if (s.nextFireRaw) {
    console.log(info(`Next fire: ${s.nextFireRaw}`));
  }
  console.log('');
  console.log('Verify later with `wua status`. Test now with `wua trigger`.');
  return 0;
}
