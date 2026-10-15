function recoverPosition(bounds, area, keep = 120) {
  return {
    x: Math.round(
      Math.max(
        area.x - bounds.width + Math.min(keep, bounds.width),
        Math.min(bounds.x, area.x + area.width - Math.min(keep, bounds.width)),
      ),
    ),
    y: Math.round(
      Math.max(
        area.y,
        Math.min(bounds.y, area.y + Math.max(0, area.height - bounds.height)),
      ),
    ),
  };
}
function walkBounds(area, offX, width) {
  const minX = Math.round(area.x - offX);
  return { minX, maxX: Math.max(minX, area.x + area.width - width) };
}
module.exports = { recoverPosition, walkBounds };
