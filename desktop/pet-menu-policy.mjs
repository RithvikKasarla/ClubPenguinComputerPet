export function uniformActorMenuItems(items) {
  if (!Array.isArray(items)) throw new TypeError("Menu items must be an array");
  return items.filter(({ id, type }) => id !== "quit" && type !== "separator");
}
