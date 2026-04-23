import { renderHelp } from './render.mjs';
import { cmdSetup } from './commands/setup.mjs';
import { cmdInstall } from './commands/install.mjs';
import { cmdUninstall } from './commands/uninstall.mjs';
import { cmdStatus } from './commands/status.mjs';
import { cmdDoctor } from './commands/doctor.mjs';
import { cmdTrigger } from './commands/trigger.mjs';

export async function run(argv) {
  const { command, flags } = parseArgs(argv);

  if (flags.help || command === 'help' || (!command && argv.length === 0 && process.stdin.isTTY)) {
    console.log(renderHelp());
    return;
  }

  if (!command) {
    console.log(renderHelp());
    return;
  }

  let code = 0;
  switch (command) {
    case 'setup':
      code = await cmdSetup(flags);
      break;
    case 'install':
      code = await cmdInstall(flags);
      break;
    case 'uninstall':
      code = await cmdUninstall(flags);
      break;
    case 'status':
      code = await cmdStatus(flags);
      break;
    case 'doctor':
      code = await cmdDoctor(flags);
      break;
    case 'trigger':
      code = await cmdTrigger(flags);
      break;
    default:
      console.error(`Unknown command: ${command}. Run \`wua help\` for usage.`);
      code = 2;
  }
  if (code !== 0) process.exit(code);
}

function parseArgs(argv) {
  const flags = {};
  let command = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--yes' || a === '-y') flags.yes = true;
    else if (a === '--no-probe') flags.noProbe = true;
    else if (!command && !a.startsWith('-')) command = a;
  }
  return { command, flags };
}
