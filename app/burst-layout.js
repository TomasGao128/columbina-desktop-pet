// All positions are DIP. The spell has its own stage and never moves the saved pet.
function layoutBurst(area, pet) {
  const limit = (value, min, max) => Math.max(min, Math.min(value, max));
  const size = Math.min(limit(pet.width, 180, 440), area.height * 0.55, area.width * 0.32);
  const span = Math.min(Math.max(640, size * 3.25), area.width - 48);
  const marginX = span / 2 + 20;
  // Include the moon at the top of the halo, not only the actor/wing bounds.
  const marginY = Math.max(size * 1.08, span * 0.27) + 24;
  const sourceCX = pet.x + pet.width / 2 - area.x;
  const sourceCY = pet.y + pet.height / 2 - area.y;
  const cx = limit(sourceCX, marginX, area.width - marginX);
  const cy = limit(sourceCY, marginY, area.height - marginY);
  return { cx, cy, sourceCX, sourceCY, size, span };
}
module.exports = { layoutBurst };
