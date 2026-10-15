// 设置项的白名单与校验规则。
//
// 为什么单独抽成一个模块：这段逻辑原先写在 main.js 的 IPC 处理器里，
// **只有把 Electron 跑起来才能碰到它**，于是"新增一个整数键却忘了给范围"
// 这类错只能靠人肉发现（2026-10-07 已经栽过两次：affection 加进来时共用了 0~999，
// activity 加进来时又会漏）。抽出来之后 scripts/test-settings.mjs 可以直接 require 它做断言，
// 不需要起窗口。
//
// 加新键的规矩：**先在下面挑一条规则放进去，再写渲染层** —— 反过来的话，
// 渲染层发出的值会被静默丢弃，症状是"设置改了但重启就丢"，很难查。

const { validEmotion, validRecords } = require("./core/emotion-memory");
const { validTuning, validFavorites } = require("./core/control-settings");
const { validMenuOrder, cloneMenuOrder } = require("./core/menu-order");
const BOOLEAN_KEYS = [
  "basketSlowMotion",
  "sound",
  "clickThrough",
  "motes",
  "reducedMotion",
  "gazeTracking",
  "focusMode",
  "cheatMode",
  "voiceOn",
];
const NUMBER_KEYS = ["scale", "opacity", "voiceVolume"]; // 浮点；语音音量另校验0—1
const INT_RANGES = {
  // 整数键必须各给范围
  burstIntensity: [0, 2], // 仅人物 / 轻柔 / 完整
  affection: [0, 999], // 好感度
  activity: [0, 2], // 活跃度：安静/正常/活泼
  energy: [0, 100], // 精力（困倦轴）
  hunger: [0, 100], // 饥饿（饱食度）：越低越饿
  interactionCount: [0, 1000000],
  favoritePose: [-1, 1000],
  favoriteGame: [0, 7],
  focusMinutes: [0, 120],
  companionSeconds: [0, 1000000000],
};
const TIME_KEYS = ["energyAt", "hungerAt", "lastSeenAt", "focusUntil"];

const ALL_KEYS = [
  ...BOOLEAN_KEYS,
  ...NUMBER_KEYS,
  ...Object.keys(INT_RANGES),
  ...TIME_KEYS,
];
ALL_KEYS.push("gameCounts", "poseCounts", "playRecords", "emotionMemory");
ALL_KEYS.push("controlTuning", "controlFavorites", "menuOrder");

function isValid(key, value) {
  if (key === "menuOrder") return validMenuOrder(value);
  if (key === "controlTuning") return validTuning(value);
  if (key === "controlFavorites") return validFavorites(value);
  if (key === "playRecords") return validRecords(value);
  if (key === "emotionMemory") return validEmotion(value);
  if (key === "voiceVolume")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1
    );
  if (key === "gameCounts" || key === "poseCounts") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const entries = Object.entries(value);
    return (
      entries.length <= (key === "gameCounts" ? 8 : 100) &&
      entries.every(
        ([id, count]) =>
          (key === "gameCounts"
            ? /^(cake|badminton|ball|sing|pinch|feather|shoulder|chatter)$/.test(
                id,
              )
            : /^(0|[1-9]\d{0,2})$/.test(id)) &&
          Number.isInteger(count) &&
          count >= 0 &&
          count <= 1000000,
      )
    );
  }
  if (BOOLEAN_KEYS.includes(key)) return typeof value === "boolean";
  if (NUMBER_KEYS.includes(key))
    return typeof value === "number" && Number.isFinite(value);
  const range = INT_RANGES[key];
  if (range)
    return Number.isInteger(value) && value >= range[0] && value <= range[1];
  if (TIME_KEYS.includes(key)) return Number.isFinite(value) && value >= 0;
  return false; // 白名单外的键一律不认
}

// 只接受白名单内且通过校验的键；其余保持原值。
// 返回新对象，不改动入参（便于测试与排查）。
function sanitize(incoming, prev = {}) {
  const next = { ...prev };
  if (!incoming || typeof incoming !== "object") return next;
  for (const key of ALL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
    if (isValid(key, incoming[key]))
      next[key] =
        key === "menuOrder"
          ? cloneMenuOrder(incoming[key])
          : key === "controlFavorites"
            ? [...incoming[key]]
            : [
                  "controlTuning",
                  "gameCounts",
                  "poseCounts",
                  "playRecords",
                  "emotionMemory",
                ].includes(key)
              ? { ...incoming[key] }
              : incoming[key];
  }
  return next;
}

module.exports = {
  ALL_KEYS,
  BOOLEAN_KEYS,
  NUMBER_KEYS,
  INT_RANGES,
  TIME_KEYS,
  isValid,
  sanitize,
};
