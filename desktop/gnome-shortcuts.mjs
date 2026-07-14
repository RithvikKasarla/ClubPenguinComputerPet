import path from "node:path";

const KEYBINDING_ROOT =
  "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings";

export const GNOME_SHORTCUTS = Object.freeze([
  {
    id: "f6",
    name: "Club Penguin Pet: Tuck or wake",
    binding: "<Control>F6",
    action: "toggle-tuck",
  },
  {
    id: "f6-tools",
    name: "Club Penguin Pet: Tuck or wake (Settings key)",
    binding: "<Control>XF86Tools",
    action: "toggle-tuck",
  },
  {
    id: "f7",
    name: "Club Penguin Pet: Actions menu",
    binding: "<Control>F7",
    action: "show-menu",
  },
  {
    id: "f8",
    name: "Club Penguin Pet: Walk somewhere",
    binding: "<Control>F8",
    action: "target-walk",
  },
  {
    id: "f10",
    name: "Club Penguin Pet: Throw snowball",
    binding: "<Control>F10",
    action: "target-snowball",
  },
]);

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function petKeybindingPath(id) {
  return `${KEYBINDING_ROOT}/club-penguin-pet-${id}/`;
}

export function parseGsettingsStringArray(value) {
  if (String(value).trim() === "@as []") return [];
  return [...String(value).matchAll(/'((?:\\'|[^'])*)'/g)]
    .map((match) => match[1].replaceAll("\\'", "'"));
}

export function formatGsettingsStringArray(values) {
  const quoted = values.map((value) => `'${String(value).replaceAll("'", "\\'")}'`);
  return `[${quoted.join(", ")}]`;
}

export function mergePetKeybindingPaths(existingPaths) {
  return [...new Set([
    ...existingPaths,
    ...GNOME_SHORTCUTS.map(({ id }) => petKeybindingPath(id)),
  ])];
}

export function removePetKeybindingPaths(existingPaths) {
  const petPaths = new Set(GNOME_SHORTCUTS.map(({ id }) => petKeybindingPath(id)));
  return existingPaths.filter((bindingPath) => !petPaths.has(bindingPath));
}

export function buildPetKeybindings({ nodePath, clientPath }) {
  if (!path.isAbsolute(nodePath) || !path.isAbsolute(clientPath)) {
    throw new TypeError("GNOME shortcut commands require absolute executable paths");
  }
  return GNOME_SHORTCUTS.map((shortcut) => ({
    ...shortcut,
    path: petKeybindingPath(shortcut.id),
    command: [nodePath, clientPath, shortcut.action].map(shellQuote).join(" "),
  }));
}
