import { readConfig, readLastRun } from '../config.mjs';
import { getScheduler } from '../schedulers/index.mjs';
import { renderStatus } from '../render.mjs';
import { probeWindow } from '../window-probe.mjs';
import { nextFireDate } from '../floor-to-hour.mjs';

/**
 * `wua status` - show config, schedule, last fire, and optionally live
 * window state. Output is designed to be paste-able to an AI agent.
 *
 * @param {{ json?: boolean, noProbe?: boolean }} flags
 */
export async function cmdStatus(flags = {}) {
  const cfg = readConfig();
  const { name: schedulerKind, impl } = getScheduler();
  const schedulerStatus = impl.status();
  const lastRun = readLastRun();

  // If the scheduler reported no nextFireRaw but we have a config, compute
  // the next fire ourselves from the configured hour/minute. This is more
  // reliable than scraping platform-specific scheduler output.
  if (schedulerStatus.installed && !schedulerStatus.nextFireRaw && cfg) {
    const next = nextFireDate({ hour: cfg.targetHour, minute: cfg.fireMinute });
    schedulerStatus.nextFireRaw = next.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  let windowState = null;
  const shouldProbe = cfg && cfg.probeWindow && !flags.noProbe;
  if (shouldProbe) {
    try {
      windowState = await probeWindow();
    } catch {
      windowState = null;
    }
  }

  if (flags.json) {
    console.log(
      JSON.stringify(
        { config: cfg, schedulerKind, scheduler: schedulerStatus, lastRun, windowState },
        null,
        2
      )
    );
    return 0;
  }

  console.log(renderStatus({ schedulerStatus, cfg, lastRun, windowState, schedulerKind }));
  return 0;
}
