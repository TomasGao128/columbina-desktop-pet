const DEFAULT = Object.freeze({
  theme: "off",
  range: 700,
  density: 55,
  brightness: 60,
});
function normalize(value = {}) {
  const next = { ...DEFAULT };
  if (!value || typeof value !== "object" || Array.isArray(value)) return next;
  if (
    [
      "off",
      "rain",
      "wind",
      "night",
      "snow",
      "fireflies",
      "maple",
      "blossom",
      "butterflies",
    ].includes(value.theme)
  )
    next.theme = value.theme;
  if (value.theme === "aurora") next.theme = "butterflies";
  for (const [key, min, max] of [
    ["range", 360, 1200],
    ["density", 10, 100],
    ["brightness", 10, 100],
  ])
    if (Number.isFinite(value[key]))
      next[key] = Math.round(Math.max(min, Math.min(max, value[key])));
  return next;
}
function layout(area, pet, range) {
  const width = Math.min(area.width, range),
    height = Math.min(area.height, Math.round(range * 0.85));
  return {
    x: Math.round(
      Math.max(
        area.x,
        Math.min(
          area.x + area.width - width,
          pet.x + pet.width / 2 - width / 2,
        ),
      ),
    ),
    y: Math.round(
      Math.max(
        area.y,
        Math.min(
          area.y + area.height - height,
          pet.y + pet.height / 2 - height / 2,
        ),
      ),
    ),
    width,
    height,
  };
}
module.exports = { DEFAULT, normalize, layout };
