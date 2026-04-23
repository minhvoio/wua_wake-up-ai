# wua - Wake Up AI

Align your AI assistant's 5-hour usage window to your workday so you stop paying for windows that drain before you sit down.

## The problem

Claude's 5-hour usage window starts the moment your machine makes the first request. On macOS that can be as early as 5:34 AM when the OS briefly wakes up, reconnects to Anthropic's servers, and silently anchors your window. By the time you actually start coding at 9 AM, your 5-hour window has already burned 3.5 hours and resets at 10:34 AM instead of 2 PM. You hit the limit mid-afternoon and pay for extra usage.

Same shape on Codex and ChatGPT Plus: a rolling window that tracks from first-use, and a weekly quota that also anchors to first-use after the prior week expires.

## What wua does

wua installs a native scheduler entry (`launchd` on macOS, `systemd --user` on Linux, Task Scheduler on Windows) that fires one cheap message at a time you choose:

```
claude -p "hi" --model haiku --no-session-persistence
```

Cost: well under $0.001 per fire. Effect: the 5-hour window is anchored to the clock hour you pick. When you sit down at 9 AM, the window runs 9 AM to 2 PM, not 5:34 AM to 10:34 AM.

The window is shared across claude.ai, Claude Desktop, and Claude Code, so firing through the CLI anchors the same window your Claude Desktop app uses.

## The mechanic

Claude floors the 5-hour window to the clock hour of the first message. This is not in the official docs, but it is confirmed by multiple community tools (including the 126-star vdsmon/claude-warmup) and easy to verify on your own account:

| Fire time | Window anchor |
|---|---|
| 8:00 AM | 8 AM to 1 PM |
| 8:15 AM | 8 AM to 1 PM |
| 8:59 AM | 8 AM to 1 PM |
| 9:00 AM | 9 AM to 2 PM |

wua defaults to firing at :15 past the target hour. Enough buffer for clock drift, still inside the target hour's bucket.

## What you see

### `wua status`

```
wua - wake up ai
Status  platform=macOS  scheduler=launchd

Config
  Assistant:     claude
  Fire time:     8:15 AM daily
  Window anchor: 8 AM to 1 PM

Scheduler
  Installed  /Users/you/Library/LaunchAgents/com.minagents.wua.plist
  Next fire:    Fri, Apr 24, 2026, 8:15 AM

Last fire
  never (wait for next scheduled fire, or run `wua trigger` to test)

Action plan (paste to an AI agent if something looks off)
  ---8<---
  wua v0.1.0 on macOS using launchd.
  Configured: fire at 8:15 AM -> 5h window 8 AM-1 PM.
  Command: claude -p hi --model haiku --no-session-persistence
  Scheduler: installed at /Users/you/Library/LaunchAgents/com.minagents.wua.plist.
  Last fire: never. Suggested action: run `wua trigger` to test.
  ---8<---
```

The `---8<---` block is the **agent-pasteable action plan**. Paste the whole thing to Claude, Codex, Cursor, or any AI assistant when something looks off. It contains everything the agent needs to diagnose and suggest fixes without you explaining.

### `wua install`

```
wua - wake up ai

The following will be installed:

  Scheduler:       launchd
  Fire time:       8:15 AM daily
  Window anchor:   8 AM to 1 PM
  Scheduler runs:  /opt/node/bin/node /path/to/wua/bin/wua.mjs trigger
  Which fires:     claude -p hi --model haiku --no-session-persistence
  Log file:        /Users/you/Library/Application Support/wua/wua.log

ok  Installed. Entry: /Users/you/Library/LaunchAgents/com.minagents.wua.plist

Verify later with `wua status`. Test now with `wua trigger`.
```

Every install step shows you the exact files, commands, and paths that will be written before it touches anything. Nothing surprises you.

### `wua doctor`

```
wua - wake up ai
Doctor  platform=macOS

  [ok] Platform detected: darwin
  [ok] claude CLI present (2.1.89 (Claude Code))
         /Users/you/.local/bin/claude
  [ok] Config loaded
         target hour 8, fire minute 15, assistant claude
  [ok] Scheduler available: launchd
         launchd (per-user LaunchAgent)
  [ok] Scheduler entry installed
         /Users/you/Library/LaunchAgents/com.minagents.wua.plist

The mechanic
  Claude anchors the 5-hour window to the CLOCK HOUR of the first request
  after the prior window expires. Fire at 8:15 AM -> window runs 8 AM to 1 PM.
  Fire at 8:55 AM -> same 8 AM to 1 PM window. Fire at 9:00 AM -> 9 AM to 2 PM.

  Window is shared across claude.ai, Claude Desktop, and Claude Code.
  Firing via the `claude` CLI anchors the same window the Desktop app uses.
```

## Install

Requirements:

- Node.js 18 or newer
- The `claude` CLI from [Claude Code](https://docs.claude.com/en/docs/claude-code/setup) installed and authenticated
- macOS, Linux with systemd, or Windows 10+

```bash
# Run once with npx
npx @minagents/wua setup

# Or install globally
npm install -g @minagents/wua
wua setup
```

Then:

```bash
wua setup       # pick your target hour (interactive)
wua install     # activate the platform scheduler
wua status      # verify, see next fire time
```

## Commands

| Command | What it does |
|---|---|
| `wua setup` | Interactive wizard. Pick the hour your 5h window should start. |
| `wua install` | Write the scheduler entry (launchd / systemd / Task Scheduler) and load it. Shows exactly what will be written, asks for approval. |
| `wua status` | Config, schedule, next fire, last fire, optional live window state. Output is paste-able to an AI agent. |
| `wua doctor` | Structured diagnostic: claude on PATH, scheduler available, config loaded. Explains the mechanic. |
| `wua uninstall` | Remove the scheduler entry. Keeps your config so you can re-install without redoing setup. |
| `wua trigger` | Fire the anchor message now. Normally called by the scheduler; run manually to test. |

Flags:

- `--json` - machine-readable output for `setup`, `status`, `doctor`
- `--yes` / `-y` - skip confirmations for `install` and `uninstall`
- `--no-probe` - skip the optional live window state call in `status`

## Supported platforms

| Platform | Scheduler | Wakes from sleep | Verified | Notes |
|---|---|---|---|---|
| macOS | `launchd` LaunchAgent | yes | local + CI (macos-latest) | Uses `StartCalendarInterval`. Per-user, no root. |
| Linux | `systemd --user` timer | no | CI (ubuntu-latest) | Fires only when user session is active. For always-on servers, use `loginctl enable-linger`. |
| Windows | Task Scheduler | yes | CI (windows-latest) | `WakeToRun=true` set on install. Per-user, no admin. |

CI runs the full `setup / install / status / trigger / uninstall` cycle on every push across all three platforms. See `.github/workflows/ci.yml`.

Supported assistants:

- **Claude Code** (v0.1.0)
- Codex CLI support is planned for v0.2.0. The underlying mechanic is the same; the difference is Codex has two windows (5-hour and weekly), both anchored to first-use after expiry.

## How it works

```
bin/wua.mjs                   CLI entry
src/cli.mjs                   Command router (no framework)
src/floor-to-hour.mjs         Pure window math
src/platform.mjs              OS detection, state dir selection
src/config.mjs                Read/write config and run log
src/claude-check.mjs          Probe for `claude` on PATH
src/window-probe.mjs          Optional read-only /api/oauth/usage call
src/render.mjs                Terminal output (only file importing chalk)
src/schedulers/
  launchd.mjs                 macOS LaunchAgent plist
  systemd.mjs                 Linux systemd user timer + service
  schtasks.mjs                Windows Task Scheduler XML
  index.mjs                   Adapter dispatcher
src/commands/
  setup.mjs                   Interactive wizard
  install.mjs                 Write scheduler entry, verify
  status.mjs                  Show current state
  doctor.mjs                  Diagnostic report
  uninstall.mjs               Clean removal
  trigger.mjs                 Called BY the scheduler: run claude -p, log result
```

The scheduler entry runs `wua trigger`, not the raw `claude` command. This means when you update wua the new trigger logic is picked up automatically on the next fire. No need to re-install the scheduler entry.

The `--no-session-persistence` and `--model haiku` flags keep each fire at the absolute minimum cost. The trigger never writes a session file to disk, never invokes any tools, never reads your project, never remembers anything.

## State files

wua keeps state per-user, no `$HOME` pollution:

| OS | State directory |
|---|---|
| macOS | `~/Library/Application Support/wua/` |
| Linux | `~/.local/state/wua/` (or `$XDG_STATE_HOME/wua/`) |
| Windows | `%LOCALAPPDATA%\wua\` |

Inside:

- `config.json` - your chosen hour, minute, assistant, trigger command
- `last-run.json` - timestamp, exit code, stdout excerpt from the most recent fire
- `wua.log` - append-only log of every fire

Plus the scheduler entry itself:

- macOS: `~/Library/LaunchAgents/com.minagents.wua.plist`
- Linux: `~/.config/systemd/user/wua.timer` and `wua.service`
- Windows: Task Scheduler entry named `wua`

## Testing

```bash
npm test
```

27 unit tests for the pure-logic core: floor-to-hour math, platform detection, scheduler unit file generation. No OS side effects in tests.

Plus platform smoke tests in CI (`.github/workflows/ci.yml`) that run the full lifecycle (`install -> status -> trigger -> uninstall`) on `macos-latest`, `ubuntu-latest`, and `windows-latest` against Node 18, 20, and 22.

## FAQ

**Will this break my Claude account or violate the terms of service?**

No. `claude -p "message"` is the official Claude Code CLI flag. Running it from launchd / systemd / Task Scheduler is architecturally identical to what Anthropic's own built-in Desktop scheduled tasks do. The banned pattern is using your OAuth token from third-party tools that impersonate Claude Code; wua does neither.

**What if Anthropic changes the window mechanic?**

wua's trigger still lights up the window since it's just a real `claude` invocation. The floor-to-hour behavior is the only thing that could change. If Anthropic ever anchors windows to exact minute instead of clock hour, update your fire minute and everything keeps working.

**What about the weekly quota?**

wua only anchors the 5-hour window. The 7-day quota is a separate limit on total usage (not timing). wua cannot and should not try to reset weekly quotas. If you're exhausting the weekly limit, look at companion tools below to find where your usage is going.

**Does this work if my machine is asleep?**

macOS: yes. Linux: only if the user session is running (use `loginctl enable-linger` for always-on servers, or keep the machine awake). Windows: yes.

**Can I use it with the Claude Desktop app?**

Yes. The 5-hour window is shared across claude.ai, Claude Desktop, and Claude Code. wua anchors through the CLI; Desktop uses the same anchored window.

## Companion tools

Once wua aligns your window, you still want to know what's draining it. Two related tools in the same family:

- **[macu](https://github.com/minhvoio/macu_minimize-ai-credit-usage)** - Minimize AI Credit Usage. Audits your MCP servers and tool usage across Claude Code, OpenCode, and Codex; identifies tools you never call and tokens you can reclaim. `npx @minagents/macu`
- **[ai-usage-monitors](https://github.com/minhvoio/ai-usage-monitors)** - Live menu-bar / terminal monitors (`cu`, `cou`) that show your current 5-hour and weekly quota burn in real time. Good for seeing wua's effect after install.

## License

MIT
