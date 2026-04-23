import { schedulerName } from '../platform.mjs';
import * as launchd from './launchd.mjs';
import * as systemd from './systemd.mjs';
import * as schtasks from './schtasks.mjs';

/**
 * Return the scheduler adapter for the current platform.
 * Each adapter exports: probe(), install(opts), uninstall(), status().
 */
export function getScheduler() {
  const name = schedulerName();
  if (name === 'launchd') return { name, impl: launchd };
  if (name === 'systemd') return { name, impl: systemd };
  if (name === 'schtasks') return { name, impl: schtasks };
  throw new Error(`Unknown scheduler: ${name}`);
}
