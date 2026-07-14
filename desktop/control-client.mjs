import { pathToFileURL } from "node:url";

import {
  DESKTOP_CONTROL_ACTIONS,
  sendDesktopControl,
} from "./control-socket.mjs";

export async function main(argv = process.argv.slice(2)) {
  const [action] = argv;
  if (!DESKTOP_CONTROL_ACTIONS.includes(action)) {
    console.error(`Usage: control-client.mjs <${DESKTOP_CONTROL_ACTIONS.join("|")}>`);
    return 2;
  }
  await sendDesktopControl(action);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
