// Local, bounded emotional memory. It never claims to be an AI conversation.
const MOODS = Object.freeze({
  calm: { label: "平静", text: "月色很静…想和你待一会儿。" },
  happy: { label: "开心", text: "今天的小小胜利，想分给你一半。" },
  determined: {
    label: "有点不服气",
    text: "差一点就做到了…陪我再试一次好吗？",
  },
  lonely: { label: "想你了", text: "刚才有点安静…你回来，我就安心了。" },
  comforted: { label: "被安慰了", text: "谢谢你…刚才的小烦恼，好像轻了很多。" },
});
function validEmotion(s) {
  return (
    !!s &&
    typeof s === "object" &&
    !Array.isArray(s) &&
    Object.keys(s).every((k) =>
      ["mood", "wins", "losses", "lastCareAt", "updatedAt", "until"].includes(
        k,
      ),
    ) &&
    Object.hasOwn(MOODS, s.mood) &&
    ["wins", "losses"].every(
      (k) => Number.isInteger(s[k]) && s[k] >= 0 && s[k] <= 99,
    ) &&
    ["lastCareAt", "updatedAt", "until"].every(
      (k) => Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1e15,
    )
  );
}
function createEmotionMemory(saved, now = Date.now()) {
  const state = validEmotion(saved)
    ? { ...saved }
    : {
        mood: "calm",
        wins: 0,
        losses: 0,
        lastCareAt: now,
        updatedAt: now,
        until: 0,
      };
  function tick(at = Date.now()) {
    const before = state.mood;
    if (at - state.lastCareAt >= 8 * 60000) state.mood = "lonely";
    else if (state.until && at >= state.until) {
      state.mood = "calm";
      state.until = 0;
    }
    return before !== state.mood;
  }
  function event(kind, detail = {}, at = Date.now()) {
    const before = state.mood;
    state.lastCareAt = at;
    state.updatedAt = at;
    if (kind === "win") {
      state.wins = Math.min(99, state.wins + 1);
      state.losses = 0;
      state.mood = detail.combo >= 2 || state.wins >= 2 ? "happy" : "calm";
    } else if (kind === "miss") {
      state.losses = Math.min(99, state.losses + 1);
      state.wins = 0;
      state.mood = state.losses >= 2 ? "determined" : "calm";
    } else if (["comfort", "feed", "headpat"].includes(kind)) {
      state.mood = "comforted";
      state.losses = 0;
    } else if (kind === "cat" || kind === "company") {
      state.mood = "happy";
      state.losses = 0;
    } else if (kind === "care" && state.mood === "lonely")
      state.mood = "comforted";
    state.until = state.mood === "calm" ? 0 : at + 3 * 60000;
    return before !== state.mood;
  }
  tick(now);
  return {
    tick,
    event,
    get snapshot() {
      return { ...state };
    },
    get description() {
      return MOODS[state.mood];
    },
  };
}
const RECORD_KEYS = Object.freeze([
  "practice",
  "streak",
  "timed",
  "combo",
  "rhythm",
]);
function validRecords(s) {
  return (
    !!s &&
    typeof s === "object" &&
    !Array.isArray(s) &&
    Object.keys(s).every((k) => RECORD_KEYS.includes(k)) &&
    RECORD_KEYS.every(
      (k) => Number.isInteger(s[k]) && s[k] >= 0 && s[k] <= 1000000,
    )
  );
}
function emptyRecords() {
  return Object.fromEntries(RECORD_KEYS.map((k) => [k, 0]));
}
function updateRecords(saved, kind, result) {
  const next = validRecords(saved) ? { ...saved } : emptyRecords();
  const key = kind === "gaming" ? "rhythm" : result.mode;
  if (!RECORD_KEYS.includes(key) || key === "combo") return next;
  if (Number.isInteger(result.score) && result.score >= 0)
    next[key] = Math.min(1000000, Math.max(next[key], result.score));
  if (kind === "basketball" && Number.isInteger(result.bestCombo))
    next.combo = Math.min(1000000, Math.max(next.combo, result.bestCombo));
  return next;
}
module.exports = {
  MOODS,
  validEmotion,
  createEmotionMemory,
  validRecords,
  emptyRecords,
  updateRecords,
};
