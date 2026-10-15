// Persistent companionship policy. Pure progression rules are also used by QA.
const RELATION_MAX = 140;
const ACTION_ORDER = [
  "walk-left",
  "walk-right",
  "bow",
  "wave",
  "listen",
  "yawn",
  "rest-chin",
  "wish",
  "cover-laugh",
  "peace",
  "stomp",
  "happy-cheeks",
  "surprise",
  "wink",
  "sit-heart",
  "run-left",
  "run-right",
  "burst",
];
const BASE_POSES = [0, 1, 2, 5, 14, 16];
const GAMES = [
  "cake",
  "badminton",
  "ball",
  "sing",
  "pinch",
  "feather",
  "shoulder",
  "chatter",
];
function growthStage(affection, interactions) {
  if (affection >= RELATION_MAX) return 3;
  if (affection >= 60 && interactions >= 30) return 2;
  if (affection >= 20 && interactions >= 10) return 1;
  return 0;
}
function unlockedIds(kind, ids, affection, interactions) {
  if (kind === "coser") {
    const stage = growthStage(affection, interactions);
    return ids.slice(0, stage === 3 ? ids.length : [6, 12, 20][stage]);
  }
  const order =
    kind === "action"
      ? ACTION_ORDER
      : [...BASE_POSES, ...ids.filter((id) => !BASE_POSES.includes(id))];
  const existing = order.filter((id) => ids.includes(id));
  const stage = growthStage(affection, interactions);
  return existing.slice(0, stage === 3 ? existing.length : [6, 10, 14][stage]);
}
function returnGreeting(lastSeenAt, now, favoriteLabel) {
  if (!lastSeenAt) return "初次见面…以后，我会记得我们的时光。";
  if (now - lastSeenAt >= 86400000)
    return favoriteLabel
      ? `你回来了…还想一起${favoriteLabel}吗？`
      : "又见面了…今天也让我陪着你吧。";
  if (now - lastSeenAt >= 3600000) return "你回来了…我记得，我们刚才还在一起。";
  return "";
}
const POSE_LINES = require("./pose-lines.json");
function poseLines(pose) {
  const lines =
    pose && Object.hasOwn(POSE_LINES, pose.id) ? POSE_LINES[pose.id] : null;
  return lines
    ? [...lines]
    : ["嗯，我在这里。", "慢慢来，我听着呢。", "这一会儿，就这样陪着你。"];
}

module.exports = {
  RELATION_MAX,
  ACTION_ORDER,
  BASE_POSES,
  GAMES,
  growthStage,
  unlockedIds,
  returnGreeting,
  poseLines,
};
