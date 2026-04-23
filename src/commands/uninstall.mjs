import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getScheduler } from '../schedulers/index.mjs';
import { success, warn, fail, banner } from '../render.mjs';

/**
 * `wua uninstall` - remove the platform scheduler entry. Does NOT delete
 * the config file (user can re-install without re-doing setup).
 *
 * @param {{ yes?: boolean }} flags
 */
export async function cmdUninstall(flags = {}) {
  const { name, impl } = getScheduler();

  // PRESENT
  const s = impl.status();
  console.log(banner());
  console.log('');
  if (!s.installed) {
    console.log(warn('No scheduler entry installed. Nothing to remove.'));
    return 0;
  }
  console.log('About to remove:');
  console.log(`  Scheduler:  ${name}`);
  console.log(`  Entry:      ${s.entryPath}`);
  console.log('');
  console.log('Your config file will be kept. You can re-install later with `wua install`.');
  console.log('');

  if (!flags.yes) {
    const rl = readline.createInterface({ input, output });
    try {
      const ans = await rl.question('Remove? [Y/n]: ');
      if (/^n/i.test(ans.trim())) {
        console.log(warn('Cancelled.'));
        return 0;
      }
    } finally {
      rl.close();
    }
  }

  const result = impl.uninstall();
  if (!result.ok) {
    console.error(fail(result.error || 'Uninstall failed.'));
    return 1;
  }

  if (result.removed && result.removed.length > 0) {
    for (const r of result.removed) console.log(success(`Removed ${r}`));
  } else {
    console.log(success('Scheduler entry removed.'));
  }
  return 0;
}
