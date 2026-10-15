// Complete PNG frames only. Animation never separates or rotates body parts.
function sceneFrame(
  milliseconds,
  { count = 6, frameMs = 260, reduced = false } = {},
) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    !Number.isFinite(frameMs) ||
    frameMs < 20
  )
    throw new TypeError("Invalid scene clip");
  const elapsed = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
  const position = reduced ? 0 : elapsed / frameMs;
  const index = Math.floor(position) % count;
  return { index };
}
module.exports = { sceneFrame };
