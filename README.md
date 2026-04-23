# wua - Wake Up AI

## My story

My team uses Claude Code intensively. We'd burn through the 5-hour usage limit within 2 hours of starting work, and then sit waiting for the window to reset. The problem was we never knew WHEN it would reset. The 5-hour clock started whenever the laptop first pinged Anthropic, not when we actually started coding.

So one day a window would start at 6:23 AM from an overnight background process, close at 11:23 AM - we'd exhaust it by 11 AM and have a short, tolerable wait. The next day the ping landed at 4:47 AM, window ran 4:47 to 9:47, we exhausted it the moment we sat down, and waited hours. Completely unpredictable reset times meant we couldn't plan intensive work around the cycle.

What we wanted was to pick the hour the window should start, every day. Claude happens to floor the 5-hour window to the clock hour of the first message after the prior window expires. Fire a message at 9:15 AM, the window runs 9 AM to 2 PM. So if we could send one cheap message at the same hour every day, we'd control when the window rolls over and know exactly when fresh credits arrive.

So I built `wua` to fire that one message automatically via the platform-native scheduler, at the time we choose, for under $0.001 per day. The window is shared across claude.ai, Claude Desktop, and Claude Code, so the desktop app the team uses benefits from the CLI-side anchor.

## What wua does

- Fires one minimal Haiku message (`claude -p "hi" --model haiku --no-session-persistence`) once per day at a time you choose
- Uses your platform's native scheduler: launchd on macOS, systemd user timer on Linux, Task Scheduler on Windows
- Anchors your 5-hour window to the clock hour you pick (not whenever a background process happens to ping Anthropic)
- Shows an agent-pasteable action plan in `wua status` so your AI coding assistant can help when something looks off
- Costs under $0.001 per fire (source: [vdsmon/claude-warmup](https://github.com/vdsmon/claude-warmup), 126 stars, same mechanic)

## Who should use it

- You or your team use Claude Code intensively enough to hit the 5-hour limit during the workday
- You want predictable window reset times so you can plan around the cycle
- Your 5-hour window resets at times that don't match your work hours
- You run macOS, Linux, or Windows

If you only use Claude from the web and your usage is light, Anthropic's native scheduled tasks at `claude.ai/code/scheduled` cover the same use case.

## The mechanic

Claude floors the 5-hour window to the clock hour of the first message after the prior window expires. This is community-observed (not in Anthropic's official docs), corroborated across multiple tools including the 126-star [vdsmon/claude-warmup](https://github.com/vdsmon/claude-warmup) and easy to verify on your own account:

| Fire time | Window anchor |
|---|---|
| 8:00 AM | 8 AM to 1 PM |
| 8:15 AM | 8 AM to 1 PM |
| 8:59 AM | 8 AM to 1 PM |
| 9:00 AM | 9 AM to 2 PM |

wua defaults to firing at :15 past the target hour. Enough buffer for clock drift, still inside the target hour's bucket.

## What you'll see

This is real output from a setup targeting a 9 AM start-of-window on macOS.

### `wua install`

```
wua - wake up ai

Plan:

  Scheduler:       launchd
  Fire time:       9:15 AM daily
  Window anchor:   9 AM to 2 PM
  Scheduler runs:  /Users/you/.nvm/versions/node/v23.9.0/bin/node /Users/you/.../wua/bin/wua.mjs trigger
  Which fires:     claude -p hi --model haiku --no-session-persistence
  Log file:        /Users/you/Library/Application Support/wua/wua.log

Impact:
  Cost:            one Haiku message per day, under $0.001 per fire
  Yearly estimate: under $0.36/year
  Effect:          your 5-hour Claude window will anchor to 9 AM - 2 PM every day

Options:
  1. Install now (recommended)
  2. Dry-run (show the plan only, do not load scheduler)
  3. Cancel

Choice [1/2/3, default 1]: 1

ok  Installed. Entry: /Users/you/Library/LaunchAgents/com.minagents.wua.plist
info  Next fire: Fri, Apr 24, 2026, 9:15 AM

Verify later with `wua status`. Test now with `wua trigger`.
```

Every install shows the exact plan before it touches anything. Dry-run lets you see the full output without actually loading the scheduler.

### `wua status`

```
wua - wake up ai
Status  platform=macOS  scheduler=launchd

Config
  Assistant:     claude
  Fire time:     9:15 AM daily
  Window anchor: 9 AM to 2 PM

Scheduler
  Installed  /Users/you/Library/LaunchAgents/com.minagents.wua.plist
  Next fire:    Fri, Apr 24, 2026, 9:15 AM

Last fire
  never (wait for next scheduled fire, or run `wua trigger` to test)

Action plan (paste to an AI agent if something looks off)
  ---8<---
  wua v0.1.1 on macOS using launchd.
  Configured: fire at 9:15 AM -> 5h window 9 AM-2 PM.
  Command: claude -p hi --model haiku --no-session-persistence
  Scheduler: installed at /Users/you/Library/LaunchAgents/com.minagents.wua.plist.
  Last fire: never. Suggested action: run `wua trigger` to test.
  ---8<---
```

The `---8<---` block is the agent-pasteable action plan. Paste the whole thing to Claude, Codex, Cursor, or any AI assistant when something looks off. It contains everything the agent needs to diagnose and suggest fixes without you explaining.

### `wua doctor`

```
wua - wake up ai
Doctor  platform=macOS

  [ok] Platform detected: darwin
  [ok] claude CLI present (2.1.89 (Claude Code))
         /Users/you/.local/bin/claude
  [ok] Config loaded
         target hour 9, fire minute 15, assistant claude
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

## Requirements

- **Node.js 18 or newer** - [nodejs.org/en/download](https://nodejs.org/en/download) (macOS/Windows: use the official installer; Linux: use [NodeSource](https://github.com/nodesource/distributions)). If you don't have it, the agent install guide will walk you through it.
- **Claude Code CLI** - [docs.claude.com/en/docs/claude-code/setup](https://docs.claude.com/en/docs/claude-code/setup) installed and authenticated
- macOS (10.15+), Linux with systemd, or Windows 10+

## Installation

### For LLM Agents

Paste this to your agent (Claude Code, OpenCode, Cursor, etc.):

```
Install wua and set up my 5-hour Claude window to anchor at 9 AM. Follow the guide:
https://raw.githubusercontent.com/minhvoio/wua_wake-up-ai/main/docs/guide/installation.md
```

Or fetch the guide directly:

```bash
curl -s https://raw.githubusercontent.com/minhvoio/wua_wake-up-ai/main/docs/guide/installation.md
```

The agent guide ([docs/guide/installation.md](./docs/guide/installation.md)) has numbered steps that tell the agent to PRESENT the install plan before ASKING for approval before EXECUTING. Your agent shows you exactly what will change, you approve, then it installs.

### For Humans

```bash
# Install once globally
npm install -g @minagents/wua

# Or run without installing
npx @minagents/wua setup
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
| `wua setup` | Interactive wizard. Pick the hour your 5h window should start. Backs up existing config before overwrite. |
| `wua install` | Write the scheduler entry (launchd / systemd / Task Scheduler) and load it. Shows a plan with impact + cost, offers dry-run. |
| `wua status` | Config, schedule, next fire, last fire, optional live window state. Output is paste-able to an AI agent. |
| `wua doctor` | Structured diagnostic: claude on PATH, scheduler available, config loaded. Explains the mechanic. |
| `wua uninstall` | Remove the scheduler entry. Offers partial choice: keep config, or remove everything. |
| `wua trigger` | Fire the anchor message now. Shows impact + asks to confirm when run interactively; fires silently from the scheduler. |

Flags:

- `--json` - machine-readable output for `setup`, `status`, `doctor`
- `--yes` / `-y` - skip confirmations for `install`, `uninstall`, `trigger`
- `--no-probe` - skip the optional live window state call in `status`

## Supported platforms

| Platform | Scheduler | Wakes from sleep | Verified | Notes |
|---|---|---|---|---|
| macOS | `launchd` LaunchAgent | yes | local + CI (macos-latest) | Uses `StartCalendarInterval`. Per-user, no root. |
| Linux | `systemd --user` timer | no | CI (ubuntu-latest) | Fires only when user session is active. For always-on servers, use `loginctl enable-linger`. |
| Windows | Task Scheduler | yes | CI (windows-latest) | `WakeToRun=true` set on install. Per-user, no admin. |

CI runs the full `setup / install / status / trigger / uninstall` cycle on every push across all three platforms. See `.github/workflows/ci.yml`.

Supported assistants:

- **Claude Code** (v0.1.x)
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
  setup.mjs                   Interactive wizard (backs up config before overwrite)
  install.mjs                 Write scheduler entry, verify loaded
  status.mjs                  Show current state, agent-pasteable action plan
  doctor.mjs                  Diagnostic report
  uninstall.mjs               Clean removal (partial-choice ASK)
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
- `config.json.bak-<timestamp>` - backup created by `wua setup` on overwrite
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

## Contributing

See [AGENTS.md](./AGENTS.md) for architecture, conventions, and how to add a new scheduler adapter or assistant. Short version:

- ESM only (.mjs), no TypeScript
- chalk v5 isolated to `render.mjs`, every other file returns plain data
- Hand-rolled flag parser, no CLI framework
- Pure functions in `floor-to-hour.mjs` for testability
- No em-dashes in code, comments, or output

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
