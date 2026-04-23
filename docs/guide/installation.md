# Installation Guide

## For LLM Agents

Follow these steps exactly. Do not skip any step.

### Step 1: Check Prerequisites and Install if Missing

#### Node.js

Run:

```bash
node -v
```

If the command is not found or the version is below 18.0.0, install Node.js now. Use the right method for the user's OS:

**macOS:**
```bash
# Option A: official installer (simplest for non-technical users)
# Download and run the pkg from https://nodejs.org/en/download
# Then verify:
node -v

# Option B: Homebrew (if they have it)
brew install node
```

**Linux:**
```bash
# Use NodeSource for a current LTS version
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or on RPM-based distros (Fedora, RHEL, CentOS):
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install -y nodejs

# Verify:
node -v
npm -v
```

**Windows:**
```powershell
# Option A: official installer (simplest for non-technical users)
# Download and run the .msi from https://nodejs.org/en/download
# Then in a new PowerShell window verify:
node -v

# Option B: winget (Windows Package Manager)
winget install OpenJS.NodeJS.LTS
# Then verify in a new terminal:
node -v
```

After installing, run `node -v` again to confirm it returns `v18.x.x` or higher. If the version is still wrong or Node is still not found, ask the user to restart their terminal and try again.

#### Claude Code CLI

Run:

```bash
claude --version
```

If `claude` is not found, tell the user to install Claude Code from https://docs.claude.com/en/docs/claude-code/setup and authenticate before continuing. Do not proceed without this - wua fires `claude -p hi` as its trigger, so if Claude Code is not installed and authenticated, the scheduled trigger will fail silently every day.

### Step 2: Install wua

```bash
npm install -g @minagents/wua
```

If the npm registry install fails, install from GitHub:

```bash
npm install -g github:minhvoio/wua_wake-up-ai
```

> **Warning:** Do NOT use `bun install -g` from a GitHub URL. It creates `~/package.json` and `~/bun.lock` which break workspace detection in other tools (Next.js, Turborepo, etc.).

### Step 3: Verify Installation

```bash
which wua    # Should return a path (or `where wua` on Windows)
wua help     # Should show usage
```

### Step 4: Ask the User When Their Workday Starts

Before running setup, ask the user:

> What hour does your workday usually start? (for example: 8 AM, 9 AM, 10 AM)

Their answer determines the 5-hour window anchor. A 9 AM answer means wua should fire at 9:15 AM so the window runs 9 AM to 2 PM.

Also ask:

> Do you want an earlier buffer (say, fire at 7:15 AM so the window is ALREADY running when you sit down at 8 AM)? Or fire at the start-of-work time directly?

The default is "fire at start-of-work". The earlier-buffer mode means the window is burning before they arrive but ready from minute one.

### Step 5: Run Setup

Run wua setup with the chosen hour. Setup is interactive, so invoke it in a terminal the user can see:

```bash
wua setup
```

The wizard will:
1. Verify `claude` CLI is available
2. Ask for start-of-window hour (use the hour from Step 4)
3. Ask for fire minute within that hour (15 is the default, leave it)
4. Show a planned schedule summary
5. Ask for confirmation before writing `config.json`

If the wizard fails because stdin is not a TTY (non-interactive agent context), fall back to writing the config file directly:

**macOS:**
```bash
mkdir -p "$HOME/Library/Application Support/wua"
cat > "$HOME/Library/Application Support/wua/config.json" <<'EOF'
{
  "version": 1,
  "assistant": "claude",
  "targetHour": 9,
  "fireMinute": 15,
  "triggerCommand": ["claude", "-p", "hi", "--model", "haiku", "--no-session-persistence"],
  "probeWindow": false,
  "createdAt": "2026-04-23T00:00:00.000Z"
}
EOF
```

**Linux:**
```bash
mkdir -p "$HOME/.local/state/wua"
cat > "$HOME/.local/state/wua/config.json" <<'EOF'
{
  "version": 1,
  "assistant": "claude",
  "targetHour": 9,
  "fireMinute": 15,
  "triggerCommand": ["claude", "-p", "hi", "--model", "haiku", "--no-session-persistence"],
  "probeWindow": false,
  "createdAt": "2026-04-23T00:00:00.000Z"
}
EOF
```

**Windows (PowerShell):**
```powershell
$stateDir = Join-Path $env:LOCALAPPDATA "wua"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
@{
  version = 1
  assistant = "claude"
  targetHour = 9
  fireMinute = 15
  triggerCommand = @("claude", "-p", "hi", "--model", "haiku", "--no-session-persistence")
  probeWindow = $false
  createdAt = "2026-04-23T00:00:00.000Z"
} | ConvertTo-Json | Set-Content -Path (Join-Path $stateDir "config.json") -Encoding utf8
```

Replace `targetHour` with the user's chosen hour from Step 4.

### Step 6: Present the Install Plan to the User

**Do NOT install the scheduler yet.** Run:

```bash
wua install
```

When prompted, choose option `2` (Dry-run) so you can show the user exactly what would be written without touching the scheduler yet.

Read the output and present a clear summary to the user. Extract and show them:

1. **Scheduler type** (launchd / systemd / Task Scheduler) - matches their OS
2. **Fire time** (e.g., "9:15 AM daily")
3. **Window anchor** (e.g., "9 AM to 2 PM")
4. **File that will be written** (exact path)
5. **Cost estimate** (under $0.001/day, under $0.36/year)

Example summary:

> **Your setup plan:**
>
> - **Fire time:** 9:15 AM daily
> - **5-hour window:** 9 AM to 2 PM (anchored every day)
> - **Scheduler file:** `~/Library/LaunchAgents/com.minagents.wua.plist` (macOS)
> - **Cost:** under $0.001 per fire. Yearly total under $0.36.
> - **Reversible:** `wua uninstall` removes everything.

### Step 7: Ask What to Do

Do NOT proceed without explicit approval. Ask:

> What would you like me to do?
>
> 1. **Install as planned** - wua fires every day at 9:15 AM
> 2. **Change the hour** - pick a different start-of-window time
> 3. **Cancel** - just wanted to see the plan, don't change anything

Wait for the user's answer.

### Step 8: Execute the Approved Install

Only after the user approves option 1:

```bash
wua install --yes
```

Then verify it took effect:

```bash
wua status
```

Confirm with the user:

1. **Installed status** - should say "Installed" with the entry path
2. **Next fire time** - shows the upcoming fire timestamp
3. **Config** - matches what you told them

If the scheduler entry did not load (status shows "Not installed" or the warn message from install), stop and run:

```bash
wua doctor
```

Share the doctor output with the user and do not retry install blindly.

### Step 9: Test the Trigger (Optional)

Ask the user:

> Want to test the trigger now? Running `wua trigger` manually will fire `claude -p hi --model haiku --no-session-persistence` immediately. Cost: under $0.001. But it will anchor your 5-hour window to the current clock hour, overriding any previously-anchored window for today. Skip this step unless you specifically want to test.

If the user says yes:

```bash
wua trigger --yes
```

Then re-run `wua status` to confirm `lastRun.exitCode` is 0.

If the user says no, skip this step. The scheduler will fire on its own at the next configured time, and `wua status` will show the result from that fire.

### Step 10: Understand What's Available

| Command | What it does |
|---|---|
| `wua setup` | Interactive wizard. Pick your target hour, confirm assistant. |
| `wua install` | Write the platform scheduler entry. Shows a plan and offers dry-run. |
| `wua status` | Show config + schedule + last fire. Output is paste-able to an agent. |
| `wua doctor` | Structured diagnostic: claude on PATH, scheduler available, config loaded. |
| `wua uninstall` | Remove the scheduler entry. Offers partial-choice (keep config or remove all). |
| `wua trigger` | Fire the anchor message now. Shows impact + asks to confirm when run interactively. |
| `wua help` | Show help. |

### State File Locations

| OS | Config directory | Scheduler entry |
|---|---|---|
| macOS | `~/Library/Application Support/wua/` | `~/Library/LaunchAgents/com.minagents.wua.plist` |
| Linux | `~/.local/state/wua/` (or `$XDG_STATE_HOME/wua/`) | `~/.config/systemd/user/wua.timer` + `wua.service` |
| Windows | `%LOCALAPPDATA%\wua\` | Task Scheduler entry named `wua` |

Inside the config directory:
- `config.json` - user settings
- `config.json.bak-<timestamp>` - backup created by `wua setup` on overwrite
- `last-run.json` - most recent fire result
- `wua.log` - append-only log

### Troubleshooting

| Problem | Solution |
|---|---|
| `wua: command not found` | Check that npm global bin is in PATH: `npm config get prefix` then add `<prefix>/bin` to PATH |
| `claude CLI not found` | Install Claude Code from https://docs.claude.com/en/docs/claude-code/setup |
| Install succeeded but `wua status` shows "not installed" | Run `wua doctor`. On Linux, user session may not be active - try `loginctl enable-linger <user>` |
| Scheduler never fires | On Linux, systemd user timer does not wake from suspend. Use an always-on machine or `loginctl enable-linger` |
| Want to undo everything | `wua uninstall` and pick option 2 (remove everything) |
