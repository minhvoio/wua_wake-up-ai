import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';
import { getScheduler } from '../schedulers/index.mjs';
import { statePaths } from '../platform.mjs';
import { success, warn, fail, banner } from '../render.mjs';

/**
 * `wua uninstall` - remove the platform scheduler entry. Offers partial-
 * choice ASK: remove scheduler only (keeps config), remove everything
 * (scheduler + config + log), or cancel.
 *
 * @param {{ yes?: boolean }} flags
 */
export async function cmdUninstall(flags = {}) {
  const { name, impl } = getScheduler();
  const s = impl.status();
  const { configFile, lastRunFile, logFile } = statePaths();
  const configExists = fs.existsSync(configFile);

  console.log(banner());
  console.log('');
  if (!s.installed && !configExists) {
    console.log(warn('Nothing to remove. No scheduler entry and no config found.'));
    return 0;
  }

  console.log('Current state:');
  if (s.installed) console.log(`  Scheduler: ${name} entry at ${s.entryPath}`);
  else console.log(`  Scheduler: not installed`);
  if (configExists) console.log(`  Config:    ${configFile}`);
  else console.log(`  Config:    not found`);
  console.log('');

  // ASK - partial choices
  let action = 'remove-scheduler';
  if (!flags.yes) {
    const rl = readline.createInterface({ input, output });
    try {
      console.log('Options:');
      console.log('  1. Remove scheduler entry only (keeps config for re-install)');
      console.log('  2. Remove everything (scheduler + config + log files)');
      console.log('  3. Cancel');
      console.log('');
      const ans = await rl.question('Choice [1/2/3, default 1]: ');
      const t = ans.trim();
      if (t === '2') action = 'remove-all';
      else if (t === '3' || /^n/i.test(t)) action = 'cancel';
    } finally {
      rl.close();
    }
  }

  if (action === 'cancel') {
    console.log(warn('Cancelled.'));
    return 0;
  }

  // EXECUTE scheduler removal
  if (s.installed) {
    const result = impl.uninstall();
    if (!result.ok) {
      console.error(fail(result.error || 'Scheduler uninstall failed.'));
      return 1;
    }
    if (result.removed && result.removed.length > 0) {
      for (const r of result.removed) console.log(success(`Removed ${r}`));
    } else {
      console.log(success('Scheduler entry removed.'));
    }
  }

  // Optionally remove config + state
  if (action === 'remove-all') {
    const candidates = [configFile, lastRunFile, logFile];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          console.log(success(`Removed ${p}`));
        } catch (err) {
          console.log(warn(`Could not remove ${p}: ${err.message}`));
        }
      }
    }
  } else {
    console.log('');
    console.log('Config kept. Run `wua install` to re-activate with the same settings.');
  }

  // VERIFY removal
  const after = impl.status();
  if (after.installed) {
    console.error(fail('Scheduler entry still reports as installed after uninstall. Run `wua doctor`.'));
    return 1;
  }
  return 0;
}
