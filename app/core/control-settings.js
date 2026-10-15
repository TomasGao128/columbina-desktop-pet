const DEFAULT_TUNING = Object.freeze({
  gazeSpeed: 1,
  dragAmount: 1,
  peekAmount: 1,
});
const TUNING_RANGES = Object.freeze({
  gazeSpeed: [0.5, 2],
  dragAmount: [0, 1.5],
  peekAmount: [0, 1.5],
});
const THEMES = Object.freeze({
  off: "关闭",
  rain: "细雨",
  wind: "微风",
  night: "晴夜",
  snow: "落雪",
  fireflies: "萤火",
  maple: "枫叶",
  blossom: "花雨",
  butterflies: "蝶舞",
});
function validTuning(value) {
  return (
    !!value &&
    typeof value === "object" &&
    Object.keys(value).length === 3 &&
    Object.entries(TUNING_RANGES).every(
      ([k, [min, max]]) =>
        Number.isFinite(value[k]) && value[k] >= min && value[k] <= max,
    )
  );
}
function validFavorites(value) {
  return (
    Array.isArray(value) &&
    value.length <= 40 &&
    value.every(
      (id) => typeof id === "string" && id.length > 0 && id.length <= 120,
    )
  );
}
module.exports = {
  DEFAULT_TUNING,
  TUNING_RANGES,
  THEMES,
  validTuning,
  validFavorites,
};
