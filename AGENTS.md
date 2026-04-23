# AGENTS.md - Guide for AI Agents

## What is this project?

`wua` (Wake Up AI) is a Node.js CLI that anchors your AI assistant's 5-hour rolling usage window to a time you choose. It fires one minimal, cheap message to Claude Code (and in future, Codex) at a scheduled time using the platform-native scheduler (launchd on macOS, systemd user timer on Linux, Task Scheduler on Windows). When you sit down to work, the window is already running in a state aligned to your workday instead of wherever a random early-morning ping happened to start it.

## The core mechanic (the whole trick)

Claude's 5-hour usage window is anchored to the **clock hour** of the first message after the prior window expires:

- Message at 6:15 AM -> window runs 6:00 AM to 11:00 AM
- Message at 7:45 AM -> window runs 7:00 AM to 12:00 PM

To get an 8 AM to 1 PM window, fire the trigger at any time between 7:00 AM and 7:59 AM. `wua` defaults to 15 minutes before the top of the target hour.

The trigger is:
```bash
claude -p "hi" --model haiku --no-session-persistence
```

Haiku + no tools + no session persistence = minimum possible token cost (well under $0.001 per fire, confirmed by vdsmon/claude-warmup with 126 stars).

The 5-hour window is shared across claude.ai, Claude Desktop, and Claude Code. Firing via `claude` CLI anchors the same window the Desktop app uses.

## Architecture

```
bin/wua.mjs                     CLI entry point (shebang, delegates to src/cli.mjs)
src/cli.mjs                     Argument parsing, command router
src/config.mjs                  Read/write state file (chosen hour, last fire, last result)
src/floor-to-hour.mjs           Pure window math (target hour -> fire time, window range)
src/platform.mjs                OS detection, state dir selection, scheduler adapter selector
src/claude-check.mjs            Probe for `claude` CLI on PATH, verify auth
src/window-probe.mjs            Optional read-only call to /api/oauth/usage for current window state
src/render.mjs                  Terminal rendering (only file that imports chalk)
src/schedulers/index.mjs        Adapter dispatcher (normalized install/uninstall/status interface)
src/schedulers/launchd.mjs      macOS LaunchAgents plist adapter
src/schedulers/systemd.mjs      Linux systemd --user timer + service adapter
src/schedulers/schtasks.mjs     Windows Task Scheduler adapter
src/commands/setup.mjs          Interactive wizard
src/commands/install.mjs        Write scheduler entry, verify loaded
src/commands/status.mjs         Show config + schedule + last fire + window state
src/commands/doctor.mjs         Diagnostic: verify scheduler, explain floor-to-hour, check auth
src/commands/uninstall.mjs      Clean removal
src/commands/trigger.mjs        Inner command called BY the scheduler - fires claude -p, logs result
```

## Data flow

```
User -> wua setup -> config written -> wua install -> scheduler entry written
                                                              |
                                                              v
                                                  scheduler fires at target_hour - 0:45
                                                              |
                                                              v
                                               `wua trigger` runs `claude -p "hi" ...`
                                                              |
                                                              v
                                                   Result logged to state dir
                                                              |
                                                              v
                                               `wua status` reads log, displays
```

## Normalized scheduler adapter interface

Every OS adapter in `src/schedulers/` must export:

```javascript
// Check if this adapter's scheduler is available on the current system
export function probe() {
  return { available: boolean, version?: string, notes?: string };
}

// Write the scheduler entry and activate it
// target: { hour: 0-23, minute: 0-59 } - the FIRE time (already floor-to-hour adjusted)
// triggerCommand: string[] - argv array, e.g. ['/usr/local/bin/node', '/path/to/wua', 'trigger']
export function install({ target, triggerCommand, logPath }) {
  return { ok: boolean, entryPath: string, error?: string };
}

// Remove the scheduler entry
export function uninstall() {
  return { ok: boolean, removed: string[], error?: string };
}

// Read current state from the scheduler
export function status() {
  return {
    installed: boolean,
    nextFireTime?: Date,
    lastFireTime?: Date,
    entryPath?: string,
    raw?: string, // raw scheduler output for debugging
  };
}
```

## State directory

Per-OS user-local state, no `$HOME` pollution:

| OS | State dir | Scheduler entry path |
|---|---|---|
| macOS | `~/Library/Application Support/wua/` | `~/Library/LaunchAgents/com.minagents.wua.plist` |
| Linux | `~/.local/state/wua/` (XDG) | `~/.config/systemd/user/wua.timer` + `wua.service` |
| Windows | `%LOCALAPPDATA%\wua\` | Task Scheduler entry named `wua` |

State files inside the state dir:
- `config.json` - user settings (target hour, minute, assistant)
- `last-run.json` - timestamp, exit code, stdout/stderr excerpt of most recent fire
- `wua.log` - append-only log of all fires (redirected stdout/stderr from `wua trigger`)

## Key decisions

- **ESM only** (`"type": "module"`), all imports use `.mjs`
- **chalk v5** is the only runtime dependency - minimalism
- **No CLI framework** - hand-rolled flag parser (like macu)
- **No prompts library** - use `readline` from stdlib for the setup wizard (avoid another dep)
- **chalk isolated to render.mjs** - every other file returns plain data
- **Pure functions** in `floor-to-hour.mjs` - fully testable without OS side effects
- **`wua trigger` IS the scheduled command** - not a shell one-liner with all the flags hardcoded in the plist. This means users can update `wua`, and the new trigger logic is picked up on the next fire without re-installing the scheduler entry.
- **Floor-to-hour default offset: 45 min before top of target hour** (fire at 7:15 for 8 AM window). Gives buffer for clock drift and late-waking machines.
- **Minimum trigger message**: `claude -p "hi" --model haiku --no-session-persistence`
- **Read-only window probe is optional** - `wua status` works without it; if enabled it calls `GET https://api.anthropic.com/api/oauth/usage` with the user's OAuth token, which is safe (confirmed not to trigger the window).

## Agent-first UX rules (per agent-ux-audit skill)

- `wua status` output is **paste-able to an agent**. It shows current state, config, and any suggested actions in a scannable summary.
- Every destructive step (`install`, `uninstall`) runs a PRESENT step before acting: shows exactly what file will be written or removed, then asks for approval.
- `wua doctor` explains the floor-to-hour mechanic inline so the user (or their agent) understands what `wua` is doing and why.

## Conventions

- No em-dashes anywhere in code, comments, or output. Use hyphen with spaces or restructure.
- Adapters catch and report scheduler errors as structured data, never throw across the module boundary.
- All file paths use Node's `path` module + platform-aware `os.homedir()` - never string-concat paths.
- Time calculations use `Date` in local time by default (the user's workday is in local time). All stored timestamps are ISO 8601 with timezone offset.

## Testing locally

```bash
npm install
node bin/wua.mjs help
node bin/wua.mjs setup       # interactive wizard
node bin/wua.mjs status      # shows current state
node bin/wua.mjs trigger     # fires claude -p manually (for testing)
node bin/wua.mjs doctor      # diagnostic

npm test                      # pure-function tests (floor-to-hour math, etc.)
```

## CI

`.github/workflows/ci.yml` runs on every push/PR:

- **unit-tests**: `npm test` on macOS, Linux, Windows x Node 18, 20, 22 (9 jobs)
- **smoke-test-macos**: full lifecycle (install -> status -> trigger -> uninstall) on `macos-latest` against launchd; verifies plist is written and removed
- **smoke-test-linux**: full lifecycle on `ubuntu-latest` against systemd user timer; verifies unit files are written and removed (actual timer activation may fail in sandboxed CI but unit file generation is verified)
- **smoke-test-windows**: full lifecycle on `windows-latest` against Task Scheduler via `schtasks.exe`; verifies task is registered and removed

The smoke tests use a stub `triggerCommand` (`/bin/true` or `cmd.exe /c echo`) to exercise the `wua trigger` code path without needing a real `claude` CLI installed.

## Adding a new scheduler adapter

1. Create `src/schedulers/<name>.mjs` exporting `probe()`, `install()`, `uninstall()`, `status()`
2. Register in `src/schedulers/index.mjs`
3. Add OS branch in `src/platform.mjs` if new platform
4. Test `install` + `uninstall` on the target OS

## Adding a new assistant (e.g. Codex)

1. Add assistant config to `src/config.mjs` (display name, trigger command template)
2. Update `src/claude-check.mjs` (or generalize to `src/assistant-check.mjs`) to probe for the new CLI
3. Update the setup wizard to offer the new assistant
4. Document the assistant's window mechanics in AGENTS.md
