// render.mjs - the ONLY file allowed to import chalk.
// All other modules return plain data; this file turns data into terminal output.

import chalk from 'chalk';
import { formatHour12, formatTime12, computeWindow } from './floor-to-hour.mjs';
import { platformName } from './platform.mjs';

const c = {
  bold: chalk.bold,
  dim: chalk.dim,
  green: chalk.green,
  yellow: chalk.yellow,
  red: chalk.red,
  cyan: chalk.cyan,
  gray: chalk.gray,
};

export function banner() {
  return c.bold.cyan('wua') + c.dim(' - wake up ai');
}

export function renderHelp() {
  return `
${banner()}

Align your AI assistant's 5-hour rolling window to your workday.

${c.bold('Commands:')}
  wua setup           Interactive wizard. Pick your target hour, confirm assistant.
  wua install         Install the platform scheduler entry (after setup).
  wua status          Show config, schedule, last fire, and (optional) current window state.
  wua doctor          Diagnose setup: scheduler loaded? claude on PATH? explain the mechanic.
  wua uninstall       Remove the scheduler entry. Does not delete config.
  wua trigger         Fire the anchor message NOW. Normally called by the scheduler.
  wua help            Show this help.

${c.bold('Options:')}
  --json              Machine-readable output (supported by setup, status, doctor).
  --yes               Skip confirmations (for install and uninstall).

${c.bold('The mechanic:')}
  Claude's 5-hour window is anchored to the clock hour of the first message
  after the prior window expires. Fire at 8:15 AM, the window runs 8 AM to 1 PM.
  wua installs a native scheduler entry (launchd, systemd, or Task Scheduler)
  that fires ${c.cyan('claude -p "hi" --model haiku --no-session-persistence')}
  once per day at a time you choose. Cost per fire: well under $0.001.
`.trimStart();
}

export function renderSetupHeader() {
  return `${banner()}\n${c.bold('Setup')}\n`;
}

/**
 * @param {{ targetHour: number, fireMinute: number, triggerCommand: string[], assistant: string }} cfg
 */
export function renderPlannedSchedule(cfg) {
  const fire = { hour: cfg.targetHour, minute: cfg.fireMinute };
  const window = computeWindow(cfg.targetHour);
  const lines = [
    '',
    c.bold('Planned schedule:'),
    `  Assistant:      ${c.cyan(cfg.assistant)}`,
    `  Fire time:      ${c.cyan(formatTime12(fire))} daily (local time)`,
    `  Window anchor:  ${c.cyan(formatHour12(window.startHour))} to ${c.cyan(formatHour12(window.endHour))}`,
    `  Command:        ${c.dim(cfg.triggerCommand.join(' '))}`,
    '',
  ];
  return lines.join('\n');
}

/**
 * @param {{ installed: boolean, entryPath?: string, nextFireRaw?: string, raw?: string, activeState?: string }} schedulerStatus
 * @param {object} cfg
 * @param {object|null} lastRun
 * @param {object|null} windowState
 * @param {string} schedulerKind
 */
export function renderStatus({ schedulerStatus, cfg, lastRun, windowState, schedulerKind }) {
  const L = [];
  L.push(banner());
  L.push(c.bold('Status') + c.dim(`  platform=${platformName()}  scheduler=${schedulerKind}`));
  L.push('');

  // Config
  if (!cfg) {
    L.push(c.yellow('No config found. Run `wua setup` first.'));
    return L.join('\n');
  }
  const fireT = { hour: cfg.targetHour, minute: cfg.fireMinute };
  const w = computeWindow(cfg.targetHour);
  L.push(c.bold('Config'));
  L.push(`  Assistant:     ${cfg.assistant}`);
  L.push(`  Fire time:     ${formatTime12(fireT)} daily`);
  L.push(`  Window anchor: ${formatHour12(w.startHour)} to ${formatHour12(w.endHour)}`);
  L.push('');

  // Scheduler
  L.push(c.bold('Scheduler'));
  if (!schedulerStatus.installed) {
    L.push(`  ${c.yellow('Not installed.')} Run ${c.cyan('wua install')} to activate.`);
  } else {
    L.push(`  ${c.green('Installed')}  ${c.dim(schedulerStatus.entryPath || '')}`);
    if (schedulerStatus.nextFireRaw) {
      L.push(`  Next fire:    ${schedulerStatus.nextFireRaw}`);
    }
    if (schedulerStatus.activeState) {
      L.push(`  State:        ${schedulerStatus.activeState}`);
    }
  }
  L.push('');

  // Last run
  L.push(c.bold('Last fire'));
  if (!lastRun) {
    L.push(`  ${c.dim('never (wait for next scheduled fire, or run `wua trigger` to test)')}`);
  } else {
    const ok = lastRun.exitCode === 0;
    const tag = ok ? c.green('ok') : c.red(`exit ${lastRun.exitCode}`);
    L.push(`  When:         ${lastRun.at}  ${tag}`);
    if (lastRun.stdout) {
      const firstLine = String(lastRun.stdout).trim().split('\n')[0];
      if (firstLine) L.push(`  Response:     ${c.dim(truncate(firstLine, 80))}`);
    }
    if (!ok && lastRun.stderr) {
      const firstErr = String(lastRun.stderr).trim().split('\n')[0];
      if (firstErr) L.push(`  Error:        ${c.red(truncate(firstErr, 80))}`);
    }
  }
  L.push('');

  // Window state (optional)
  if (windowState) {
    L.push(c.bold('Current window (live)'));
    const pct = Math.round(windowState.fiveHourPercentLeft);
    L.push(`  5h left:      ${pctBar(pct)} ${pct}%  resets ${windowState.fiveHourResetsAt}`);
    if (typeof windowState.weeklyPercentLeft === 'number') {
      const wp = Math.round(windowState.weeklyPercentLeft);
      L.push(`  weekly left:  ${pctBar(wp)} ${wp}%  resets ${windowState.weeklyResetsAt || ''}`);
    }
    L.push('');
  }

  // Agent-pasteable summary
  L.push(c.bold('Action plan') + c.dim(' (paste to an AI agent if something looks off)'));
  L.push(agentSummary({ schedulerStatus, cfg, lastRun, windowState, schedulerKind }));

  return L.join('\n');
}

export function renderDoctor(report) {
  const L = [];
  L.push(banner());
  L.push(c.bold('Doctor') + c.dim(`  platform=${platformName()}`));
  L.push('');

  for (const check of report.checks) {
    const badge =
      check.level === 'ok' ? c.green('ok') : check.level === 'warn' ? c.yellow('warn') : c.red('fail');
    L.push(`  [${badge}] ${check.name}`);
    if (check.detail) L.push(`         ${c.dim(check.detail)}`);
    if (check.fix) L.push(`         ${c.cyan('fix:')} ${check.fix}`);
  }
  L.push('');

  L.push(c.bold('The mechanic'));
  L.push(
    '  Claude anchors the 5-hour window to the CLOCK HOUR of the first request'
  );
  L.push(
    '  after the prior window expires. Fire at 8:15 AM -> window runs 8 AM to 1 PM.'
  );
  L.push(
    '  Fire at 8:55 AM -> same 8 AM to 1 PM window. Fire at 9:00 AM -> 9 AM to 2 PM.'
  );
  L.push('');
  L.push('  Window is shared across claude.ai, Claude Desktop, and Claude Code.');
  L.push('  Firing via the `claude` CLI anchors the same window the Desktop app uses.');

  return L.join('\n');
}

export function success(msg) {
  return c.green('ok') + '  ' + msg;
}
export function info(msg) {
  return c.cyan('info') + '  ' + msg;
}
export function warn(msg) {
  return c.yellow('warn') + '  ' + msg;
}
export function fail(msg) {
  return c.red('fail') + '  ' + msg;
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '...';
}

function pctBar(pct) {
  const width = 20;
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  const empty = width - filled;
  const bar = '#'.repeat(filled) + '.'.repeat(empty);
  if (pct > 50) return c.green(bar);
  if (pct > 20) return c.yellow(bar);
  return c.red(bar);
}

function agentSummary({ schedulerStatus, cfg, lastRun, schedulerKind }) {
  const lines = [];
  lines.push(c.gray('  ---8<---'));
  lines.push(c.gray(`  wua v0.1.0 on ${platformName()} using ${schedulerKind}.`));
  if (cfg) {
    const fireT = { hour: cfg.targetHour, minute: cfg.fireMinute };
    const w = computeWindow(cfg.targetHour);
    lines.push(
      c.gray(
        `  Configured: fire at ${formatTime12(fireT)} -> 5h window ${formatHour12(w.startHour)}-${formatHour12(w.endHour)}.`
      )
    );
    lines.push(c.gray(`  Command: ${cfg.triggerCommand.join(' ')}`));
  }
  if (schedulerStatus.installed) {
    lines.push(c.gray(`  Scheduler: installed at ${schedulerStatus.entryPath}.`));
  } else {
    lines.push(c.gray(`  Scheduler: NOT installed. Suggested action: run \`wua install\`.`));
  }
  if (lastRun) {
    if (lastRun.exitCode === 0) {
      lines.push(c.gray(`  Last fire: ${lastRun.at} succeeded.`));
    } else {
      lines.push(
        c.gray(
          `  Last fire: ${lastRun.at} FAILED (exit ${lastRun.exitCode}). Suggested: run \`wua doctor\`.`
        )
      );
    }
  } else {
    lines.push(c.gray(`  Last fire: never. Suggested action: run \`wua trigger\` to test.`));
  }
  lines.push(c.gray('  ---8<---'));
  return lines.join('\n');
}
