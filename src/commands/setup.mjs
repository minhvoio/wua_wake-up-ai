import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { DEFAULT_CONFIG, readConfig, writeConfig } from '../config.mjs';
import { checkClaude } from '../claude-check.mjs';
import { computeWindow, formatHour12, formatTime12 } from '../floor-to-hour.mjs';
import { renderSetupHeader, renderPlannedSchedule, success, warn, fail, info } from '../render.mjs';

/**
 * Interactive setup wizard. Runs end-to-end in one terminal session.
 * Writes config but does NOT install the scheduler. User runs `wua install`
 * next so they can review before anything touches their system.
 *
 * @param {{ json?: boolean }} flags
 */
export async function cmdSetup(flags = {}) {
  process.stdout.write(renderSetupHeader());

  // Step 1: check that `claude` is available.
  const claude = checkClaude();
  if (claude.installed) {
    console.log(success(`\`claude\` CLI found (version: ${claude.version}).`));
  } else {
    console.log(fail(claude.error || '`claude` CLI not found.'));
    console.log(
      '       Install Claude Code first: https://docs.claude.com/en/docs/claude-code/setup'
    );
    console.log('       Then run `wua setup` again.');
    return 1;
  }

  const existing = readConfig();
  const defaults = existing || DEFAULT_CONFIG;

  if (flags.json) {
    // non-interactive shortcut: just print the defaults and exit. Real
    // interactive use goes through the wizard below.
    console.log(JSON.stringify(defaults, null, 2));
    return 0;
  }

  const rl = readline.createInterface({ input, output });

  try {
    console.log('');
    console.log('Tell me when your 5-hour window should START.');
    console.log(
      "For a standard workday, pick the hour you'd actually sit down to code. " +
        'The window runs 5 hours from there.'
    );
    console.log('');

    // Step 2: pick target hour.
    const hourAns = await rl.question(
      `Start-of-window hour (0-23, default ${defaults.targetHour}): `
    );
    const targetHour = parseIntSafe(hourAns.trim(), defaults.targetHour);
    if (targetHour == null || targetHour < 0 || targetHour > 23) {
      console.log(fail(`Invalid hour: ${hourAns}. Must be 0-23.`));
      return 1;
    }

    // Step 3: pick fire minute within the hour (default 15).
    const minuteAns = await rl.question(
      `Fire minute within that hour (0-59, default ${defaults.fireMinute}): `
    );
    const fireMinute = parseIntSafe(minuteAns.trim(), defaults.fireMinute);
    if (fireMinute == null || fireMinute < 0 || fireMinute > 59) {
      console.log(fail(`Invalid minute: ${minuteAns}. Must be 0-59.`));
      return 1;
    }

    // Step 4: PRESENT plan before writing anything.
    const cfg = {
      ...defaults,
      targetHour,
      fireMinute,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
    };
    process.stdout.write(renderPlannedSchedule(cfg));

    const window = computeWindow(targetHour);
    console.log(
      info(
        `Because Claude floors the window to the clock hour of the fire, firing at ` +
          `${formatTime12({ hour: targetHour, minute: fireMinute })} gives you a ` +
          `${formatHour12(window.startHour)} to ${formatHour12(window.endHour)} window.`
      )
    );
    console.log('');

    // Step 5: ASK to save.
    const confirm = await rl.question('Save this config? [Y/n]: ');
    if (/^n/i.test(confirm.trim())) {
      console.log(warn('Cancelled. No config written.'));
      return 0;
    }

    const path = writeConfig(cfg);
    console.log(success(`Config saved to ${path}`));
    console.log('');
    console.log('Next step: run `wua install` to activate the scheduler.');
    console.log('Or run `wua trigger` to fire once manually and verify.');
    return 0;
  } finally {
    rl.close();
  }
}

function parseIntSafe(s, fallback) {
  if (!s || s.length === 0) return fallback;
  const n = Number.parseInt(s, 10);
  if (Number.isNaN(n)) return null;
  return n;
}
