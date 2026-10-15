function dragTilt(dx, elapsed) {
  if (!Number.isFinite(dx) || !Number.isFinite(elapsed) || elapsed <= 0)
    return 0;
  const speed = dx / Math.max(16, elapsed);
  return Math.abs(speed) < 0.04 ? 0 : Math.max(-5, Math.min(5, -speed * 3));
}
function edgeProgress(center, left, width) {
  const distance = Math.min(center - left, left + width - center);
  return Math.max(0, Math.min(1, (120 - distance) / 60));
}
function createFeedbackPicker(random = Math.random) {
  const previous = new Map();
  return (key, lines) => {
    if (!lines?.length) return "";
    const candidates = lines
      .map((_, i) => i)
      .filter((i) => lines.length === 1 || i !== previous.get(key));
    const index =
      candidates[
        Math.min(
          candidates.length - 1,
          Math.floor(Math.max(0, random()) * candidates.length),
        )
      ];
    previous.set(key, index);
    return lines[index];
  };
}
module.exports = { dragTilt, edgeProgress, createFeedbackPicker };
