export const PET_HITBOX = Object.freeze({
  halfWidth: 90,
  top: 150,
  bottom: 18,
});

export function isPointInPetHitbox(position, point) {
  return Math.abs(point.x - position.x) <= PET_HITBOX.halfWidth
    && point.y >= position.y - PET_HITBOX.top
    && point.y <= position.y + PET_HITBOX.bottom;
}
