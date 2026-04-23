import { readConfig } from '../config.mjs';
import { checkClaude, resolveClaudeBin } from '../claude-check.mjs';
import { getScheduler } from '../schedulers/index.mjs';
import { renderDoctor } from '../render.mjs';
import { detectPlatform } from '../platform.mjs';

/**
 * `wua doctor` - diagnose common failure modes and print a structured report.
 * Designed to be paste-able to an AI agent for automated debugging.
 *
 * @param {{ json?: boolean }} flags
 */
export async function cmdDoctor(flags = {}) {
  const checks = [];

  // 1. Platform supported
  try {
    const p = detectPlatform();
    checks.push({ level: 'ok', name: `Platform detected: ${p}` });
  } catch (err) {
    checks.push({ level: 'fail', name: 'Unsupported platform', detail: err.message });
  }

  // 2. claude CLI
  const claude = checkClaude();
  if (claude.installed) {
    const loc = resolveClaudeBin() || 'on PATH';
    checks.push({
      level: 'ok',
      name: `claude CLI present (${claude.version})`,
      detail: loc,
    });
  } else {
    checks.push({
      level: 'fail',
      name: 'claude CLI not found',
      detail: claude.error,
      fix: 'Install Claude Code from https://docs.claude.com/en/docs/claude-code/setup',
    });
  }

  // 3. Config
  const cfg = readConfig();
  if (cfg) {
    checks.push({
      level: 'ok',
      name: 'Config loaded',
      detail: `target hour ${cfg.targetHour}, fire minute ${cfg.fireMinute}, assistant ${cfg.assistant}`,
    });
  } else {
    checks.push({
      level: 'warn',
      name: 'No config yet',
      fix: 'Run `wua setup` to create one.',
    });
  }

  // 4. Scheduler probe + status
  let schedulerKind = null;
  try {
    const { name, impl } = getScheduler();
    schedulerKind = name;
    const probe = impl.probe();
    if (probe.available) {
      checks.push({ level: 'ok', name: `Scheduler available: ${name}`, detail: probe.notes });
    } else {
      checks.push({
        level: 'fail',
        name: `Scheduler not available: ${name}`,
        detail: probe.notes,
      });
    }
    const s = impl.status();
    if (s.installed) {
      checks.push({
        level: 'ok',
        name: 'Scheduler entry installed',
        detail: `${s.entryPath}${s.nextFireRaw ? `  next: ${s.nextFireRaw}` : ''}`,
      });
    } else if (cfg) {
      checks.push({
        level: 'warn',
        name: 'Scheduler entry not installed',
        fix: 'Run `wua install` to activate.',
      });
    }
  } catch (err) {
    checks.push({ level: 'fail', name: 'Scheduler check failed', detail: err.message });
  }

  const report = { checks, schedulerKind };

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  console.log(renderDoctor(report));
  return checks.some((c) => c.level === 'fail') ? 1 : 0;
}
