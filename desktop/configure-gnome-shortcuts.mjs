import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildPetKeybindings,
  formatGsettingsStringArray,
  mergePetKeybindingPaths,
  parseGsettingsStringArray,
  removePetKeybindingPaths,
} from "./gnome-shortcuts.mjs";

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.join(desktopDirectory, "control-client.mjs");
const listSchema = "org.gnome.settings-daemon.plugins.media-keys";
const listKey = "custom-keybindings";
const bindingSchema = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";

function gsettings(...args) {
  const result = spawnSync("gsettings", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `gsettings ${args[0]} failed`);
  }
  return result.stdout.trim();
}

function setValue(schema, key, serializedValue) {
  gsettings("set", schema, key, serializedValue);
}

export function configureGnomeShortcuts({ remove = false } = {}) {
  const existing = parseGsettingsStringArray(gsettings("get", listSchema, listKey));
  const bindings = buildPetKeybindings({
    nodePath: process.execPath,
    clientPath,
  });

  if (remove) {
    setValue(
      listSchema,
      listKey,
      formatGsettingsStringArray(removePetKeybindingPaths(existing)),
    );
    for (const binding of bindings) {
      const schema = `${bindingSchema}:${binding.path}`;
      for (const key of ["name", "binding", "command"]) gsettings("reset", schema, key);
    }
    return "Removed Club Penguin Pet GNOME shortcuts.";
  }

  for (const binding of bindings) {
    const schema = `${bindingSchema}:${binding.path}`;
    setValue(schema, "name", JSON.stringify(binding.name));
    setValue(schema, "binding", JSON.stringify(binding.binding));
    setValue(schema, "command", JSON.stringify(binding.command));
  }
  setValue(
    listSchema,
    listKey,
    formatGsettingsStringArray(mergePetKeybindingPaths(existing)),
  );
  return "Installed Club Penguin Pet GNOME shortcuts (Ctrl+F6/F7/F8/F10).";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(configureGnomeShortcuts({ remove: process.argv.includes("--remove") }));
}
