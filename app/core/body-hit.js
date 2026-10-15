// Geometry is in CSS/DIP coordinates; the alpha mask is independent of display DPI.
function bodyHit(mask, x, y) {
  if (!mask || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const { cx, cy, width, height, angle = 0, pixels, size } = mask;
  const dx = x - cx,
    dy = y - cy,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const u = (dx * c + dy * s) / width + 0.5;
  const v = (-dx * s + dy * c) / height + 0.5;
  if (u < 0 || v < 0 || u >= 1 || v >= 1 || width <= 0 || height <= 0)
    return false;
  return pixels[Math.floor(v * size) * size + Math.floor(u * size)] >= 24;
}
module.exports = { bodyHit };
