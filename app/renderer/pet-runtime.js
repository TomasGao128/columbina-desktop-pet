// Shared classic-script bindings: see docs/code-standards.md.
const { ipcRenderer } = require("electron");
const petContainer = document.getElementById("petContainer");
const pet = document.getElementById("pet");
const headZone = document.getElementById("headZone");
let interactionFeel = null;
const pickFeedback = require("../core/interaction-feel").createFeedbackPicker();
const bellyZone = document.getElementById("bellyZone");
const footZone = document.getElementById("footZone");
const footRipples = document.getElementById("footRipples");
const bubble = document.getElementById("bubble");
const rightMenu = document.getElementById("rightMenu");
const subMenu = document.getElementById("subMenu");

let isPlayingAction = false;
let companion = null;
let moonEffects = null;
let playroom = null;
let emotionDirector = null;
let playRecords = require("../core/emotion-memory").emptyRecords();
let emotionMemory = null;
let basketSlowMotion = true;
let gazeTracking = true;
let controlTuning = { ...require("../core/control-settings").DEFAULT_TUNING };
let controlFavorites = [];
let menuOrder = {};
let dragging = false;
let startMouseX = 0,
  startMouseY = 0;
let bubbleTimer = null;
// 走路状态在这里声明（原来声明在文件末尾的「自主走动」段）。
// 上面的 playFrames 会调 stopWalking()，提前声明避免"声明前使用"的隐患。
let walking = false,
  walkTimer = null,
  walkFrameTimer = null,
  walkPreparing = false;
// 音效开关：右键菜单「设置 → 音效」可关，关掉后所有交互静音
let soundOn = true;
let burstIntensity = 2;
let reducedMotion = false;
const BURST_INTENSITY_NAMES = ["仅人物", "轻柔", "完整"];
// 点击穿透相关状态。声明必须放在这里（早于下面的设置读取），否则
// loadSettings 在声明前赋值会踩 TDZ 直接抛错。
let clickThrough = true; // 用户开关，见「设置 → 点击穿透」
let ignoringMouse = false; // 与主进程同步的当前状态，只在翻转时发 IPC
let debugNoWalk = false; // 调试模式下禁止自主走动（自动化测试要可复现的窗口位置）
// 窗口**总共**收到多少次鼠标按下（不限于三个部位）。排查"点了没反应"时，
// 它和 statClicks 一比就能定位问题在哪一层：0 说明事件根本没送达窗口，
// 涨了但 statClicks 没涨说明送达了却没命中区域。
let statDowns = 0;
let lastMouse = null; // 最近一次鼠标位置（窗口内坐标）

// 活跃度：0 安静 / 1 正常 / 2 活泼，只影响走动频率。
// ⚠️ 这三个常量与 `activity` 必须声明在**菜单定义与 loadSettings 之前**：
//    菜单项的 state() 在构建菜单时就会读 ACTIVITY_NAMES，loadSettings 会写 activity，
//    声明落在文件后面的走动段落里就会踩 TDZ —— 整个渲染层脚本在那里抛异常停摆，
//    表现得像"菜单没了、什么都点不动"。这个错 2026-10-07 被冒烟测试当场抓到过。
const ACTIVITY_NAMES = ["安静", "正常", "活泼"];
const ACTIVITY_MUL = [0.45, 1, 1.6];
let activity = 1;

// ===== 精力 / 困倦轴（"她会困"）=====
// 好感度回答"我们关系多近"，精力回答"她现在还有没有力气" —— 两个维度合起来才有作息感：
// 长时间没人理 → 精力下降 → 念叨困 → 直接躺下打盹；你一碰她，她就醒。
// 素材（躺姿 6 张）与台词（persona.md 的「困了」段）都是现成的，所以这条轴成本很低。
// ⚠️ 与 activity 同理：这些常量必须早于 loadSettings 与菜单定义（TDZ 已经栽过一次）。
const ENERGY_MAX = 100;
const ENERGY_DECAY_PER_MS = 1 / 30000; // 每 30 秒掉 1 点：满电约 50 分钟见底
const ENERGY_SLEEPY = 45; // 低于此值显露困意
const ENERGY_ASLEEP = 15; // 低于此值睡着（躺姿 + 不走动）
const ENERGY_WAKE = 25; // 每次互动补多少
let energy = ENERGY_MAX;
let energyAt = Date.now(); // 上次结算时刻：退出期间的衰减靠它补算
let sleeping = false;
let activeUserPose = null;
let resting = false,
  walkingFatigueMs = 0,
  walkStartedAt = 0,
  lastRestEndedAt = 0;
const WALK_REST_THRESHOLD_MS = 20000;
const SHORT_REST_MS = 18000,
  REST_COOLDOWN_MS = 60000;

function idleRestChance() {
  return energyTier() === "sleepy" ? 0.7 : 0.4;
}
function takeShortRest(reason = "idle", duration = SHORT_REST_MS) {
  if (voiceDirector?.status.active || edgeSide) return false;
  if (sleeping || walking || isPlayingAction || dragging || menuOpen)
    return false;
  resting = true;
  isPlayingAction = true;
  const pose = SLEEP_POSES[Math.floor(Math.random() * SLEEP_POSES.length)];
  showBubble(
    reason === "walk" ? "走了一会儿…让我歇一会儿。" : "月色很静…想躺一会儿。",
  );
  pet.classList.add("breathing");
  actionPlayer.play([pose], {
    holdMs: duration,
    onDone: () => {
      resting = false;
      isPlayingAction = false;
      walkingFatigueMs = 0;
      lastRestEndedAt = Date.now();
      settleEnergy();
      energy = Math.min(ENERGY_MAX, energy + 8);
      saveSettingsSoon();
      restoreBasePose();
    },
    onError: () => {
      resting = false;
      isPlayingAction = false;
      lastRestEndedAt = Date.now();
      restoreBasePose();
    },
  });
  return true;
}

// ===== 饥饿轴（饱食度）=====
// 与精力**共用同一套「时间戳 + 结算」机制**：加一条需求轴的边际成本已经很低了
// （素材有蛋糕相关帧、台词有 persona.md 的「饿了 / 吃饱了 / 吃蛋糕」三段）。
const HUNGER_MAX = 100;
const HUNGER_DECAY_PER_MS = 1 / 45000; // 每 45 秒掉 1 点：满腹约 75 分钟见底
const HUNGER_HUNGRY = 30; // 低于此值开始喊饿
const FEED_GAIN = 40; // 一次喂食补多少
let hunger = HUNGER_MAX;
let hungerAt = Date.now();
// 月光粒子开关（右键菜单「设置 → 月光特效」）
let motesOn = true;
// 调试用：三个身体区域各自被点到的次数、以及收到的 mousemove 次数
// （主进程带 PET_DEBUG=1 启动时会读取这些值）
let statClicks = 0;
let statMoves = 0;

// ===== 好感度系统 =====
// 分档阈值、档位名、四档台词与 10 句升级台词，**全部逐字取自**
// docs/knowledge/persona.md 的「等级-陌生/熟悉/亲密/挚友」与「升级」段，不做改写。
// 设计参考 VPet / 虚拟桌宠模拟器那类作品：互动累积、分档解锁不同语气的台词。
// 这里比它们省事的地方是——知识库早就把四档台词写好了，直接接上即可。
//
// 注意 `let affection` 必须声明在 loadSettings() 之前（它在那儿读盘恢复），
// 否则会踩 let 的暂时性死区直接抛错、整个渲染层脚本停摆（症状是"点什么都没反应"）。
const TIERS = [
  { key: "stranger", name: "陌生", min: 0 },
  { key: "familiar", name: "熟悉", min: 20 },
  { key: "intimate", name: "亲密", min: 60 },
  { key: "best", name: "挚友", min: 140 },
];

// ===== 台词数据化（2026-10-07 第七轮）=====
// 台词的事实来源是 docs/knowledge/persona.md；代码只消费由 scripts/build-persona.mjs
// 生成的 app/persona.json（主进程读文件后经 IPC 交给渲染层，渲染层不做路径体操）。
// 下面这份 FALLBACK 是**兜底**：文件缺失/写坏时宁可说旧台词，也不能让桌宠变成哑巴。
// 两条路径哪条生效会记在 personaLinesFrom 里，并出现在调试快照中（可验证）。
const FALLBACK_TIER_LINES = {
  stranger: [
    "嗯...你好",
    "我们...还不太熟呢",
    "请...多多关照哦",
    "我...还不太了解你",
    "慢慢来...不急",
  ],
  familiar: [
    "哦...是你呀",
    "我们...已经很熟了呢",
    "你...今天也来了呢",
    "我...记得你哦",
    "嗯...像朋友一样了呢",
  ],
  intimate: [
    "你...来了呀",
    "我...一直在等你呢",
    "看到你...我就开心",
    "我们...是好朋友了呢",
    "嗯...有你真好",
  ],
  best: [
    "亲爱的...你来了",
    "我...好想你哦",
    "你...是我最重要的人",
    "永远...在一起哦",
    "我爱你...哦",
  ],
};
const FALLBACK_LEVELUP = [
  "嗯...我感觉...和你更近了呢",
  "这种感觉...好奇妙",
  "我们...越来越亲密了呢",
  "谢谢你...一直陪着我",
  "我...越来越喜欢你了哦",
  "嗯...这就是...羁绊吗？",
  "时间...好像变快了呢",
  "我...能感受到你的心意",
  "我们...要一直在一起哦",
  "嗯...真好呢",
];
let personaLinesFrom = "fallback";
let personaSections = null;
let personaData = null;
try {
  personaData = ipcRenderer.sendSync("get-persona");
} catch (e) {
  console.warn("persona.json 读取失败，使用内置台词兜底：", e && e.message);
}
if (
  personaData &&
  personaData.tiers &&
  personaData.levelUp &&
  Object.keys(personaData.tiers).length === 4
) {
  personaLinesFrom = "file";
  personaSections = personaData.sections || null;
}
const TIER_LINES =
  personaLinesFrom === "file" ? personaData.tiers : FALLBACK_TIER_LINES;
const LEVELUP_LINES =
  personaLinesFrom === "file" ? personaData.levelUp : FALLBACK_LEVELUP;
let affection = 0;
let lastAffectionAt = 0;
const CompanionPolicy = require("./companionship.js");
let focusMode = false,
  focusUntil = 0,
  focusMinutes = 25,
  cheatMode = false;
let interactionCount = 0,
  lastInteractionAt = 0,
  favoritePose = -1,
  favoriteGame = 0;
let companionSeconds = 0,
  companionSessionAt = Date.now(),
  previousSeenAt = 0;
let gameCounts = {},
  poseCounts = {},
  lifeUI = null;
let voiceOn = true,
  voiceVolume = 0.75,
  voiceDirector = null;
const VOICE_CATALOG = require("./voice-catalog.json");
// 20 秒内最多涨 1 点：连点刷分会让"亲密"来得毫无过程感，反而削弱了这个系统
const AFFECTION_GAP_MS = 20000;

function tierOf(v) {
  let cur = TIERS[0];
  for (const t of TIERS) if (v >= t.min) cur = t;
  return cur;
}
function tierByKey(key) {
  return TIERS.find((t) => t.key === key) || TIERS[0];
}

// ===== 精力：结算 / 分档 / 互动补充 =====
// 用「时间戳 + 结算」而不是 setInterval 掉点：这样退出期间的衰减也能补算，
// 重启后她是"睡了 5 分钟"还是"睡了 5 小时"是对得上的。
function settleEnergy() {
  const now = Date.now();
  const elapsed = Math.max(0, now - energyAt);
  if (elapsed > 0) {
    // **需求互相影响**：饿着的时候精力掉得更快（1.6 倍）。
    // 两条需求轴各自独立衰减会像两个互不相干的进度条；
    // 有了耦合，"饿"才会真的把人拖累，行为上也就有因果可读。
    const factor = hungerTier() === "hungry" ? 1.6 : 1;
    energy = Math.max(
      0,
      Math.round(energy - elapsed * ENERGY_DECAY_PER_MS * factor),
    );
    energyAt = now;
  }
  return energy;
}
function energyTier(e = energy) {
  if (e <= ENERGY_ASLEEP) return "asleep";
  if (e <= ENERGY_SLEEPY) return "sleepy";
  return "awake";
}

// ===== 饥饿：结算 / 分档 / 喂食 =====
function settleHunger() {
  const now = Date.now();
  const elapsed = Math.max(0, now - hungerAt);
  if (elapsed > 0) {
    hunger = Math.max(0, Math.round(hunger - elapsed * HUNGER_DECAY_PER_MS));
    hungerAt = now;
  }
  return hunger;
}
function hungerTier(h = hunger) {
  return h <= HUNGER_HUNGRY ? "hungry" : "full";
}
// 喂食：补饱食度，顺带提一点精神（吃到甜的当然会精神些）
function feed() {
  emotionDirector?.event("feed");
  settleHunger();
  settleEnergy();
  hunger = Math.min(HUNGER_MAX, hunger + FEED_GAIN);
  energy = Math.min(ENERGY_MAX, energy + 8);
  const cake =
    (personaSections && personaSections.cake && personaSections.cake.lines) ||
    [];
  const full =
    (personaSections && personaSections.full && personaSections.full.lines) ||
    [];
  const pool = hungerTier() === "full" && full.length ? full : cake;
  const line = pool.length
    ? pool[Math.floor(Math.random() * pool.length)]
    : "谢谢你...真的";
  if (!isPlayingAction) playCompanion("cake", [line]);
  else showBubble(line);
  saveSettingsSoon();
}

// ===== 当前状态（单一出口）=====
// 需求轴变多以后最怕"到处都要补一次判断"。这里给一个统一出口：
// 谁想知道她现在怎么了，就问 currentState()，不要各自去读 energy/hunger/sleeping。
// 优先级：睡着 > 困 > 饿 > 精神（睡着时喊饿没有意义）。
function currentState() {
  settleEnergy();
  settleHunger();
  if (energyTier() === "asleep") return "asleep";
  if (focusMode) return "focus";
  if (energyTier() === "sleepy") return "sleepy";
  if (hungerTier() === "hungry") return "hungry";
  return "awake";
}
// 状态表：这一处同时回答"她怎么了""能不能自己走动""能不能随机换待机帧""头顶挂什么"。
// 目的就是不再让人去各处补 if —— 上一版走动守卫与待机帧守卫分散在两个地方，
// 加一条需求轴就要回来补两处判断。新增轴时只改这张表。
// 同 harness 的 dsh-pet-desktop 也有"状态气泡"，说明方向是对的。
const STATE_TABLE = {
  focus: {
    word: "安静陪伴",
    canWalk: false,
    canIdleSwap: false,
    badge: "🌙",
    hint: "专注时，我会安静陪你",
  },
  asleep: {
    word: "睡着了",
    canWalk: false,
    canIdleSwap: false,
    badge: "💤",
    hint: "碰她一下就醒",
  },
  sleepy: {
    word: "有点困",
    canWalk: true,
    canIdleSwap: true,
    badge: "🥱",
    hint: "该让她歇会儿了",
  },
  hungry: {
    word: "饿了",
    canWalk: true,
    canIdleSwap: true,
    badge: "",
    hint: "右键喂食 🍰",
  },
  awake: {
    word: "精神着",
    canWalk: true,
    canIdleSwap: true,
    badge: "",
    hint: "",
  },
};
// 词表从表里派生，避免同一份文案写两处
const STATE_WORDS = Object.fromEntries(
  Object.entries(STATE_TABLE).map(([k, v]) => [k, v.word]),
);
// 每次互动都补精力（不受好感度冷却限制：摸一下就该精神一点）
function touchEnergy() {
  const wasAsleep = sleeping;
  settleEnergy();
  energy = Math.min(ENERGY_MAX, energy + ENERGY_WAKE);
  if (wasAsleep) wakeUp();
  updateStateBadge(); // 互动可能改变状态（唤醒/不饿了），徽标要跟上
}
// 随机休息只使用用户指定的「躺下休息」「抱膝而坐」两张姿势。
const SLEEP_POSES = ["./pose-lie-01.webp", "./pose-lie-02.webp"];
function fallAsleep() {
  if (sleeping) return;
  releaseEdgePeek();
  cancelAction();
  sleeping = true;
  companion?.releaseLook();
  if (walking) stopWalking();
  pet.classList.add("breathing"); // 睡着也要有呼吸感，否则一张静止躺姿看起来像卡死
  sleepPose = SLEEP_POSES[Math.floor(Math.random() * SLEEP_POSES.length)];
  pet.src = sleepPose;
  const sleepy = (personaSections &&
    personaSections.sleepy &&
    personaSections.sleepy.lines) || ["嗯...有点困了呢"];
  if (!focusMode && !speakMatched("sleep"))
    showBubble(sleepy[Math.floor(Math.random() * sleepy.length)]);
}
function wakeUp() {
  if (!sleeping) return;
  cancelAction();
  sleeping = false;
  sleepPose = null;
  pet.classList.remove("breathing");
  pet.src = companion?.idleFrame || "./frame-1.webp";
  // 醒来先打个招呼（用当前档位的问候语，逐字来自 persona.md）
  const lines = TIER_LINES[tierOf(affection).key];
  showBubble(lines[Math.floor(Math.random() * lines.length)]);
}

// 头顶的状态徽标：她不舒服时（困/饿/睡）挂一个小图标，不用右键也知道她怎么了。
// 状态只有被看见，用户才会去照顾 —— 这是"状态可读"的落地。
function updateStateBadge() {
  const el = document.getElementById("stateBadge");
  if (!el) return;
  const st = currentState();
  const badge = STATE_TABLE[st].badge;
  el.textContent = badge;
  el.style.display = badge ? "block" : "none";
}

// 每 30 秒结算一次精力：够低就睡着。进入/退出睡眠只在状态翻转时做动作，
// 所以这里反复调用 fallAsleep() 是幂等的。
setInterval(() => {
  settleEnergy();
  settleHunger();
  const st = currentState();
  if (st === "asleep" && !voiceDirector?.status.story) {
    fallAsleep();
    // 睡着时偶尔说句梦话（用 persona.md 的「彩蛋」段）—— 让"睡着"也是一段有内容的表演
    if (!focusMode && !isPlayingAction && Math.random() < 0.3) {
      const egg =
        (personaSections &&
          personaSections["easter-egg"] &&
          personaSections["easter-egg"].lines) ||
        [];
      if (egg.length) showBubble(egg[Math.floor(Math.random() * egg.length)]);
    }
  } else if (
    !focusMode &&
    st === "hungry" &&
    !isPlayingAction &&
    !walking &&
    Math.random() < 0.25
  ) {
    // 饿了会念叨（用 persona.md 的「饿了」段，逐字）
    const lines =
      (personaSections &&
        personaSections.hungry &&
        personaSections.hungry.lines) ||
      [];
    if (lines.length)
      showBubble(lines[Math.floor(Math.random() * lines.length)]);
  }
  updateStateBadge(); // 状态变了就刷新头顶徽标
  saveSettingsSoon(); // 顺带把精力/饱食度落盘（防抖），重启后衰减才算得准
}, 30000);

// 涨好感；跨档时返回 true（调用方据此改说升级台词）
function addAffection(n) {
  touchEnergy(); // 每次互动都补精力（不受好感度冷却限制：摸一下就该精神一点）
  const now = Date.now();
  if (now - lastAffectionAt < AFFECTION_GAP_MS) return false;
  lastAffectionAt = now;
  const before = tierOf(affection);
  affection = Math.max(
    0,
    Math.min(CompanionPolicy.RELATION_MAX, affection + n),
  );
  const after = tierOf(affection);
  saveSettingsSoon();
  announceRelationChange(before, after);
  return after.key !== before.key;
}
// 下一次涨分还要等多久（菜单里给个提示，免得用户以为点了没用）
function affectionCooldownLeft() {
  return Math.max(0, AFFECTION_GAP_MS - (Date.now() - lastAffectionAt));
}

// 叮咚音效。用 WebAudio 现场合成，不依赖任何音频文件。
// 每次现建 AudioContext 是有意的 —— 常驻一个 context，挂机久了会被浏览器
// 挂起（suspended），再点就没声音了。
function playChime() {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      ctx.close().catch(() => {});
    };
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {}
}

const preloadFrames = createFrameLoader();
let actionCatalog = null;
let actionPlayer = new PetSequencePlayer({
  prepare: preloadFrames,
  render: (src) => {
    companion?.releaseLook();
    pet.src = src;
  },
});
const SMOOTH_ACTIONS = require("./action-clips.json");
function smoothOptions(key, extra = {}) {
  const cfg = SMOOTH_ACTIONS[key];
  return {
    frameMs: cfg.frameMs,
    holdMs: cfg.holdMs,
    frameDurations: cfg.frameDurations,
    ...extra,
  };
}
function playSmooth(key, lines, extra = {}) {
  if (
    CompanionPolicy.ACTION_ORDER.includes(key) &&
    !contentUnlocked("action", key)
  ) {
    showLockedContent();
    return false;
  }
  return playFrames(
    SMOOTH_ACTIONS[key].frames,
    lines,
    smoothOptions(key, {
      memoryKind: key.startsWith("touch-") ? "touch" : "action",
      memoryId: key,
      ...extra,
    }),
  );
}
let sleepPose = null;
let petReactions = null;
let edgeSide = null;
const { EDGE_PEEKS } = require("../core/edge-peek");
function releaseEdgePeek(move = true) {
  if (!edgeSide) return;
  edgeSide = null;
  delete petContainer.dataset.edge;
  ipcRenderer.sendSync("release-pet-edge", move);
  restoreBasePose();
}
function showEdgePeek(side) {
  if (!EDGE_PEEKS[side]) return;
  cancelAction();
  edgeSide = side;
  petContainer.dataset.edge = side;
  companion?.releaseLook();
  restoreBasePose();
}

function cancelAction({ preserveVoice = false, preserveFeel = false } = {}) {
  if (!preserveFeel) interactionFeel?.cancel();
  playroom?.cancel();
  stopWalking();
  petReactions?.cancel();
  moonEffects?.clear();
  if (!preserveVoice) voiceDirector?.stop();
  companion?.stopEffects();
  companion?.stopDrag();
  if (resting) {
    resting = false;
    lastRestEndedAt = Date.now();
  }
  cancelMoonBurst();
  actionPlayer.cancel();
  isPlayingAction = false;
  pet.classList.remove(
    "listening",
    "gentle-bow",
    "moon-wish",
    "pose-soft-breathe",
    "portrait-fit",
  );
  restoreBasePose();
}
function restoreBasePose() {
  petContainer.classList.remove("portrait-showcase");
  pet.style.removeProperty("--portrait-ratio");
  moonEffects?.clear();
  activeUserPose = null;
  companion?.releaseLook();
  companion?.stopEffects();
  pet.classList.remove(
    "listening",
    "gentle-bow",
    "moon-wish",
    "pose-soft-breathe",
    "portrait-fit",
  );
  if (sleeping) {
    pet.src = sleepPose || SLEEP_POSES[1];
    pet.classList.add("breathing");
  } else if (focusMode) {
    pet.classList.remove("breathing");
    pet.src = SLEEP_POSES[1];
  } else if (edgeSide && !dragging) {
    pet.classList.remove("breathing");
    pet.src = EDGE_PEEKS[edgeSide].frame;
  } else {
    pet.classList.remove("breathing");
    pet.src = companion?.idleFrame || "./frame-1.webp";
    companion?.resumeIdle();
  }
}
function placeBubble() {
  if (bubble.style.display === "none") return;
  const width = bubble.offsetWidth,
    height = bubble.offsetHeight;
  const center = petContainer.offsetLeft + petContainer.offsetWidth / 2;
  const x = Math.max(
    width / 2 + 8,
    Math.min(center, innerWidth - width / 2 - 8),
  );
  bubble.style.left = x - petContainer.offsetLeft + "px";
  bubble.style.bottom = "auto";
  bubble.style.top =
    Math.max(8, petContainer.offsetTop - height - 8) -
    petContainer.offsetTop +
    "px";
}
function showBubble(text, durationMs = null, voiceCaption = false) {
  if (voiceDirector?.status.active && !voiceCaption) return;
  bubble.innerText = text;
  bubble.style.display = "block";
  placeBubble();
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(
    () => (bubble.style.display = "none"),
    durationMs ?? Math.max(2800, Math.min(6500, String(text).length * 95)),
  );
}
function triggerFootRipple(side = "left", contact = null) {
  const ring = document.createElement("span");
  ring.className = "foot-ripple";
  ring.style.left = contact
    ? contact.x * 100 + "%"
    : side === "right"
      ? "59%"
      : "41%";
  if (contact) ring.style.bottom = (1 - contact.y) * pet.offsetHeight + "px";
  ring.addEventListener("animationend", () => ring.remove(), { once: true });
  footRipples.appendChild(ring);
}
function playFrames(frames, lines, options = {}) {
  if (edgeSide && options.automatic) return false;
  const actionId = ["pose", "game", "mood", "coser"].includes(
    options.memoryKind,
  )
    ? `${options.memoryKind}:${options.memoryId}`
    : options.memoryId;
  if (actionCatalog && !actionPlayer.canStart(actionId, options).accepted)
    return false;
  if (resting) cancelAction();
  if (dragging) return false;
  // Explicit menu selections replace the current sequence; autonomous actions never do.
  if (isPlayingAction) {
    if (options.automatic || !actionCatalog) return false;
    cancelAction();
  }
  releaseEdgePeek();
  voiceDirector?.stop();
  companion?.releaseLook();
  if (walking) stopWalking();
  if (sleeping) touchEnergy();
  hideMenus();
  isPlayingAction = true;
  if (!options.automatic)
    recordCompanionship(options.memoryKind || "other", options.memoryId);
  if (!options.automatic && options.memoryKind !== "touch") addAffection(1);
  if (options.motionClass) pet.classList.add(options.motionClass);
  const menuFeedback = require("../core/menu-feedback").chooseMenuFeedback(
    actionId,
    lines,
  );
  // Text-first menu selections must not be overwritten by recorded captions.
  if (
    menuFeedback.textOnly ||
    actionCatalog?.get(actionId)?.voice === false ||
    options.memoryKind === "touch" ||
    options.memoryKind === "pose" ||
    !speakMatched(
      `${options.memoryKind || "mood"}:${options.memoryId ?? "generic"}`,
    )
  ) {
    playChime();
    showBubble(pickFeedback(actionId || "touch", menuFeedback.lines));
  }
  const frameMs = options.frameMs || 280;
  const holdMs =
    options.holdMs || Math.max(800, 2400 - (frames.length - 1) * frameMs);
  const effectKey = `${options.memoryKind || "mood"}:${options.memoryId ?? "generic"}`;
  const effectPose =
    options.memoryKind === "pose"
      ? USER_POSES.find((p) => p.id === options.memoryId)
      : null;
  const effectVariant = effectPose
    ? effectPose.effect ||
      (/卧|憩/.test(effectPose.label)
        ? "sleep"
        : /舞|踮/.test(effectPose.label)
          ? "notes"
          : /祈/.test(effectPose.label)
            ? "wish"
            : /笑/.test(effectPose.label)
              ? "happy"
              : "moon")
    : effectKey;
  moonEffects?.play(effectKey, {
    variant: effectVariant,
    duration: (frames.length - 1) * frameMs + holdMs,
  });
  actionPlayer.play(frames, {
    actionId,
    automatic: options.automatic === true,
    frameMs,
    holdMs,
    frameDurations: options.frameDurations,
    onFrame: options.onFrame,
    onBlend: options.onBlend,
    prepareExtra: options.prepareExtra,
    onDone: () => {
      isPlayingAction = false;
      restoreBasePose();
      options.onDone?.();
    },
    onError: (error) => {
      voiceDirector?.stop();
      console.error(error.message);
      isPlayingAction = false;
      restoreBasePose();
      showBubble("这段动作暂时没准备好…");
    },
  });
  return true;
}

const COMPANION_ACTIONS = require("./companion-actions.json");
const COMPANION_LINES = {
  badminton: ["轻轻接住…再送回给你。"],
  cake: ["谢谢你…甜甜的。"],
  ball: ["嗯…小球也想一起玩吗？"],
  sing: ["我轻轻哼一段…陪着你。"],
  pinch: ["嗯…轻一点，好吗？"],
  feather: ["一片羽毛…轻轻落在掌心。"],
  shoulder: ["嗯…我在这里。"],
};
function playCompanion(key, lines = COMPANION_LINES[key]) {
  const cfg = COMPANION_ACTIONS[key];
  if (!cfg || !COMPANION_LINES[key] || !companion || dragging) return false;
  companion.stopEffects();
  companion.releaseLook();
  return playFrames(cfg.frames, lines, {
    memoryKind: "game",
    memoryId: key,
    frameMs: cfg.frameMs,
    holdMs: cfg.holdMs,
    frameDurations: cfg.frameDurations,
    onFrame: (_src, index) => companion.showEffect(key, index),
  });
}

function playStomp() {
  playSmooth("stomp", [
    "哼…我可是月之女神！",
    "月亮都被你气暗了！",
    "不理你了！",
  ]);
}
function playCoverLaugh() {
  playSmooth("cover-laugh", [
    "哈哈哈…真是拿你没办法",
    "月色下的你真有趣",
    "噗嗤…你怎么这么可爱",
  ]);
}
function playPeaceSign() {
  playSmooth("peace", [
    "今夜的月色，为你定格",
    "与你并肩，星月皆柔",
    "这一刻，月光正好",
  ]);
}
const BOW_FRAMES = SMOOTH_ACTIONS.bow.frames;
const WISH_FRAMES = SMOOTH_ACTIONS.wish.frames;
const WAVE_SOFT_FRAMES = SMOOTH_ACTIONS.wave.frames;
function playGentleBow() {
  playSmooth("bow", ["你来了…月色正好。"], { motionClass: "gentle-bow" });
}
function playMoonWish() {
  playSmooth("wish", ["愿你今天，也有温柔的好事。"], {
    motionClass: "moon-wish",
  });
}
function playListen() {
  playSmooth("listen", ["嗯…我在听。", "慢慢说，不用着急。"], {
    motionClass: "listening",
  });
}
function playWaveHello() {
  playSmooth("wave", ["欢迎回来，我等你很久了", "嗯，见到你真好"]);
}

function playSurpriseMouth() {
  playSmooth("surprise", [
    "啊…竟然是这样",
    "星月都为之一颤",
    "这太令人惊讶了…",
  ]);
}
function playSitHeart() {
  playSmooth("sit-heart", [
    "月亮知道，我最喜欢你",
    "我的心意，随月光送达",
    "比心，给我的你",
  ]);
}
function playWink() {
  playSmooth("wink", [
    "嘘…这是月亮和你的秘密",
    " wink~ 只有你懂哦",
    "今晚，我们共享月色",
  ]);
}
function playHappyCheeks() {
  playSmooth("happy-cheeks", [
    "有你在的夜晚，真温柔",
    "这样靠着月光，真好",
    "今天的我，格外幸福",
  ]);
}

// ===== 单帧表情 =====
// 素材池里的单帧动作（害羞／大笑／吐舌……）都走这一个函数：定格 holdMs 毫秒后回站立帧。
// 多帧动作走 playFrames，两者共用 isPlayingAction 做互斥。
//
// 单帧素材为全身透明底；六张躺姿使用 idle-cloth.js 中的 64% 独立体型校准。
// 这一点是挑素材时专门拼联络表验过的：池子里那些按编号命名的"成套动作"
// （smile-01…05 / blink-01…05 等）其实是从原始 79 帧序列里任意切的，
// 里面混着两张脸部大特写帧、还有举双手摆姿，接进来会突然缩放跳帧，所以没有采用。
const SINGLE_HOLD_MS = 3600;

const USER_POSES = require("./user-poses.json");
const COSER_POSES = require("./coser-poses.json");
function fitPortrait(pose) {
  petContainer.classList.add("portrait-showcase");
  pet.style.setProperty("--portrait-ratio", pose.widthRatio || 1);
}
function playCoserPose(id) {
  if (!contentUnlocked("coser", id)) {
    showLockedContent();
    return false;
  }
  const pose = COSER_POSES.find((item) => item.id === id);
  if (!pose || dragging) return false;
  return playFrames([pose.frame], ["这身衣裳…你觉得怎么样？"], {
    memoryKind: "coser",
    memoryId: id,
    holdMs: 7200,
    motionClass: "portrait-fit",
    onFrame: () => {
      fitPortrait(pose);
    },
  });
}
function playUserPose(id) {
  if (!contentUnlocked("pose", id)) {
    showLockedContent();
    return false;
  }
  const pose = USER_POSES.find((p) => p.id === id);
  if (!pose || dragging) return false;
  if (isPlayingAction && activeUserPose !== null) cancelAction();
  const started = playFrames([pose.frame], CompanionPolicy.poseLines(pose), {
    memoryKind: "pose",
    memoryId: id,
    holdMs: pose.holdMs,
    motionClass: pose.widthRatio ? "portrait-fit" : "pose-soft-breathe",
    onFrame: () => {
      if (pose.widthRatio) fitPortrait(pose);
      if (pose.effect && pose.effect !== "pose-moon")
        companion?.showEffect(pose.effect, 0);
    },
  });
  if (started) activeUserPose = id;
  return started;
}
function playSingle(src, lines, holdMs, voiceKey = "generic") {
  playFrames([src], lines, {
    memoryKind: "mood",
    memoryId: voiceKey,
    holdMs: holdMs || SINGLE_HOLD_MS,
  });
}

// 托腮发呆
function playRestChin() {
  playSmooth("rest-chin", ["望着月亮，思绪飘远了…"]);
}
// 打哈欠
function playYawn() {
  playSmooth("yawn", ["嗯~ 有点困了…"]);
}
let lastSleepyAnimationAt = 0;
function trySleepyAnimation() {
  if (
    currentState() !== "sleepy" ||
    focusMode ||
    lifeUI?.active ||
    voiceDirector?.status.active ||
    sleeping ||
    resting ||
    walking ||
    walkPreparing ||
    isPlayingAction ||
    dragging ||
    menuOpen
  )
    return false;
  if (Date.now() - lastSleepyAnimationAt < 90000 || Math.random() >= 0.35)
    return false;
  const started = playFrames(
    SMOOTH_ACTIONS.yawn.frames,
    ["嗯~ 有点困了…"],
    smoothOptions("yawn", {
      automatic: true,
      memoryKind: "action",
      memoryId: "yawn",
    }),
  );
  if (started) lastSleepyAnimationAt = Date.now();
  return started;
}

// 以下10项使用心情菜单的原有基础文本。
// 每项新增的3条情境气泡集中在 menu-bubbles.json，与原配音分支混合展示。
const MOODS = {
  shy: {
    file: "./head-shy.png",
    lines: ["…别这样看着我", "脸颊有点烫…是月色太暖了", "嗯…我记住了"],
  },
  laugh: {
    file: "./belly-laugh.png",
    lines: ["呵…你真是有趣", "月色都被你逗笑了", "难得…我笑得这么开心"],
  },
  tongueOut: {
    file: "./tongue-out.png",
    lines: ["略…月亮才不告诉你", "这是月亮的秘密哦", "偶尔也想调皮一下呢"],
  },
  ignore: {
    file: "./angry-ignore.png",
    lines: ["哼…月光都被你气淡了", "…先不理你了", "等我一下，我还在生气"],
  },
  wave: {
    file: "./hand-wave.png",
    lines: ["你回来啦", "来，坐我旁边", "月光下，我一直在这儿"],
  },
  cheer: {
    file: "./cheer-up.png",
    lines: [
      "别怕，星月都站在你这边",
      "我为你祈祷…愿月光护你",
      "去吧，我等你回来",
    ],
  },
  expect: {
    file: "./expect-look.png",
    lines: ["…然后呢？", "我听着呢，继续说", "嗯…我想知道更多"],
  },
  shyCover: {
    file: "./shy-cover.png",
    lines: ["别看了…", "月亮太亮了，藏不住", "这样…有点难为情"],
  },
  coax: {
    file: "./shy-coax.png",
    lines: ["再陪我一会儿…", "就一小会儿，好吗", "月光还长，不用急着走"],
  },
  sad: {
    file: "./sit-sad.png",
    lines: ["…有点想家了", "至冬的雪，还在下吗", "没关系…我习惯了等"],
  },
};
const playMood = (key) => {
  const m = MOODS[key];
  playSingle(m.file, m.lines, undefined, key);
};

// ===== 走路与跑步帧 =====
// 四组素材分别按方向播放；走路/跑步和自主走动共用同一批实际帧。
const {
  buildWalkCycle,
  buildRunCycle,
  WALK_FRAME_MS,
  WALK_STEP_MS,
  RUN_FRAME_MS,
  WALK_LANDING_FRAMES,
  RUN_LANDING_FRAMES,
  getLandingSide,
  getLandingContact,
} = require("./walk-cycle.js");
const WALK_LEFT = buildWalkCycle("left");
const WALK_RIGHT = buildWalkCycle("right");
const RUN_LEFT = buildRunCycle("left");
const RUN_RIGHT = buildRunCycle("right");
// Warm only the two walking cycles for autonomous movement. Running sprites
// decode on demand through PetSequencePlayer, avoiding an eager 50-image burst.
const WALK_FRAMES_READY = preloadFrames([...WALK_LEFT, ...WALK_RIGHT]);
WALK_FRAMES_READY.catch((error) =>
  console.warn("Walk sprites unavailable:", error.message),
);

function playLocomotion(frames, landingFrames, speed, line, action) {
  if (!contentUnlocked("action", action)) {
    showLockedContent();
    return false;
  }
  const repeated = [...frames, ...frames];
  const landings = new Set(landingFrames);
  playFrames(repeated, [line], {
    memoryKind: "action",
    memoryId: action,
    frameMs: speed,
    holdMs: 350,
    onFrame: (_src, index) => {
      const frameIndex = index % frames.length;
      if (landings.has(frameIndex))
        triggerFootRipple(
          getLandingSide(landingFrames, frameIndex),
          getLandingContact(action, frameIndex),
        );
    },
  });
}

// 向左走
function playWalkLeft() {
  playLocomotion(
    WALK_LEFT,
    WALK_LANDING_FRAMES.left,
    WALK_FRAME_MS,
    "我去左边看看…",
    "walk-left",
  );
}

// 向右走
function playWalkRight() {
  playLocomotion(
    WALK_RIGHT,
    WALK_LANDING_FRAMES.right,
    WALK_FRAME_MS,
    "我去右边走走…",
    "walk-right",
  );
}
function playRunLeft() {
  playLocomotion(
    RUN_LEFT,
    RUN_LANDING_FRAMES.left,
    RUN_FRAME_MS,
    "我轻快地跑去左边…",
    "run-left",
  );
}
function playRunRight() {
  playLocomotion(
    RUN_RIGHT,
    RUN_LANDING_FRAMES.right,
    RUN_FRAME_MS,
    "我轻快地跑去右边…",
    "run-right",
  );
}

// 三个部位各自使用独立透明动画；旧动作帧已移出运行目录。
const HEAD_FRAMES = SMOOTH_ACTIONS["touch-head"].frames;
const BELLY_FRAMES = SMOOTH_ACTIONS["touch-chest"].frames;
const FOOT_FRAMES = SMOOTH_ACTIONS["touch-foot"].frames;

// 点头 → 温柔开心的回应，跨好感档位也保留当前触碰语气
headZone.onclick = () => {
  statClicks++;
  if (resting) cancelAction();
  if (isPlayingAction) return;
  addAffection(2);
  playSmooth("touch-head", [
    "嗯…你的手，好温暖。",
    "轻轻的…我很喜欢。",
    "再摸一会儿，好吗？",
    "呵呵…有一点开心呢。",
    "唔…头发被你揉乱了。",
    "这样摸着…有些想睡了。",
    "靠近一点…我哼首歌给你听。",
    "啦…啦啦…你听见了吗？",
    "好舒服…让我再闭一会儿眼。",
    "被你这样照顾…有些不好意思。",
    "呵呵…我没有躲开呀。",
    "你喜欢摸摸我的头吗？",
    "嗯…再轻一点，就很好。",
    "发梢有些痒…呵呵。",
    "今天的你…好温柔。",
    "你来了…难怪心情变好了。",
    "我在这里…不用着急。",
    "还要摸吗？嗯…可以哦。",
    "让我靠一会儿…就一会儿。",
    "唔…别碰歪了我的发饰。",
    "安静地陪着我…也很好。",
  ]);
};
// 点胸 → 抱胸生气
bellyZone.onclick = () => {
  statClicks++;
  if (resting) cancelAction();
  if (isPlayingAction) return;
  addAffection(2);
  playSmooth("touch-chest", [
    "嗯…不可以这样碰哦。",
    "又调皮了…我会生气的。",
    "哼…先把手收回去。",
    "这里不可以…听见了吗？",
    "唔…你怎么又闹我。",
    "想叫我，轻轻喊一声就好。",
    "我看见你的小动作了哦。",
    "别装作什么都没发生…",
    "哼…我要把袖子拢起来了。",
    "再这样…我就转过身去了。",
    "道歉的话…要好好说哦。",
    "不是每次撒娇…我都会答应。",
    "手收好…我才继续陪你。",
    "你呀…总有些淘气。",
    "嗯…先安安静静坐一会儿。",
    "我还在生气呢…一点点。",
    "别笑…我很认真。",
    "乖一点…我就不计较了。",
    "哼…下次不许这样了。",
    "陪我听首歌吧…别再闹啦。",
  ]);
};
// 右键菜单：整个窗口右键都能触发，不会因为布局偏移点不到
document.oncontextmenu = (e) => {
  e.preventDefault();
  showMainMenu();
};
// 点脚 → 惊讶委屈（音效由 playFrames 统一播）
footZone.onclick = () => {
  statClicks++;
  if (resting) cancelAction();
  if (isPlayingAction) return;
  addAffection(1);
  playSmooth("touch-foot", [
    "呀…有一点痒。",
    "轻一点…吓了我一跳。",
    "嗯？想和我一起散步吗？",
    "唔…脚尖会躲开的哦。",
    "别挠啦…呵呵，好痒。",
    "怎么忽然碰这里…",
    "我还以为…是一阵小风。",
    "等等…让我站稳一点。",
    "刚走了一会儿…想歇歇。",
    "嗯…地面有些凉呢。",
    "想看涟漪的话…我走给你看。",
    "别急着拉我走…先陪我坐坐。",
    "你是在提醒我起来走走吗？",
    "唔…这次我有准备了。",
    "好痒…让我把脚收起来。",
    "嗯？有什么掉在脚边了吗？",
    "轻轻的…别吓着我呀。",
    "想出去看看吗…等我一下。",
  ]);
};

// 每30秒随机切换一个待机小表情。
// 只挑**站姿、同比例**的帧：像大笑、撒娇这种明显换姿势的不能放进来，
// 否则会像"抽搐"一下而不是自然的小表情（原来的 6 帧太少，轮几次就重复）。
const idleRandomFrames = [
  "./frame-3.webp",
  "./frame-4.webp",
  "./frame-5.webp",
  "./frame-6.webp",
  "./head-shy.png",
  "./cheer-up.png",
  "./expect-look.png",
  "./tongue-out.png",
];
function playIdleExpression(
  f = idleRandomFrames[Math.floor(Math.random() * idleRandomFrames.length)],
) {
  // walking 也要挡：这是"随机动作"，不能把走路动画的帧换掉
  if (
    isPlayingAction ||
    dragging ||
    walking ||
    edgeSide ||
    menuOpen ||
    !STATE_TABLE[currentState()].canIdleSwap
  )
    return false;
  const version = actionPlayer.version;
  companion?.releaseLook();
  pet.src = f;
  const expressionSrc = pet.src;
  setTimeout(() => {
    if (
      version === actionPlayer.version &&
      pet.src === expressionSrc &&
      !isPlayingAction &&
      !walking &&
      !sleeping &&
      !dragging
    )
      restoreBasePose();
  }, 2000);
  return true;
}
const idleExpressionTimer = null;

// 拖拽
// 必须用 pointer 事件 + setPointerCapture。桌宠只占 220x220，而窗口是 400x500，
// 拖动时光标很容易划出窗口；用 document.onmouseup 的话这次松手就送不到页面，
// dragging 会永远停在 true —— 桌宠从此黏着鼠标跑，而且窗口跟着动会让 click 的
// mousedown/mouseup 落在不同位置，表现为"点哪儿都没反应"。
let pendingDrag = false;
let dragPointerId = undefined;
let suppressNextClick = false;
const DRAG_THRESHOLD = 4; // 位移不超过这个值就当作点击，不启动拖拽

petContainer.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || dragPointerId !== undefined) return;
  if (burstActive) {
    cancelMoonBurst();
    restoreBasePose();
  }
  if (walking) stopWalking(); // 想拖它就别再自己走了
  // 这里**不能**调 preventDefault()：取消 pointerdown 会抑制兼容鼠标事件（含 click），
  // 头/胸/脚三个区域的 onclick 就全都不会触发了。防选框交给 CSS 的 user-select:none。
  // 同理，setPointerCapture 也不能在这里设 —— 在父元素上捕获会把 click 重定向到
  // petContainer，子区域的 onclick 同样收不到。等确认是拖拽之后再设。
  // A fresh press cannot belong to the compatibility click from the previous drag.
  suppressNextClick = false;
  companion?.cancelDrop();
  dragPointerId = e.pointerId;
  startMouseX = e.screenX;
  startMouseY = e.screenY;
  pendingDrag = true;
  ipcRenderer.send("drag-begin");
});

petContainer.addEventListener("pointermove", (e) => {
  if (e.pointerId !== dragPointerId) return;
  if (!dragging) {
    if (!pendingDrag) return;
    if (
      Math.hypot(e.screenX - startMouseX, e.screenY - startMouseY) <
      DRAG_THRESHOLD
    )
      return;
    // 确认是拖拽了才捕获：这样光标拖出窗口后 pointerup 依然收得到，
    // 而单纯的点击全程不捕获，click 仍会正常落在头/胸/脚区域上。
    try {
      petContainer.setPointerCapture(e.pointerId);
    } catch (err) {}
    releaseEdgePeek(false);
    cancelAction();
    if (sleeping) touchEnergy();
    dragging = true;
    companion?.startDrag({ x: e.screenX, y: e.screenY });
    moonEffects?.play("drag", { duration: 3200 });
    if (!speakMatched("drag")) showBubble("轻轻地…我跟你走。");
  }
  // 每一步都现算桌宠中心相对窗口的偏移，随更新一起发。
  // 不能在开始时缓存，也不能让主进程拿 win.getSize() 推算 —— 实测拖动过程中窗口
  // 会被莫名放大（窗口矩形和渲染层视口两种尺寸都可能变），缓存的偏移会立刻过期，
  // 表现为桌宠越拖越往下沉。只有现算才能始终贴住光标。
  const r = pet.getBoundingClientRect();
  companion?.moveDrag({ x: e.screenX, y: e.screenY });
  interactionFeel?.dragMove({ x: e.screenX, y: e.screenY });
  ipcRenderer.send("drag-update", {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
  });
});

function endDrag(e) {
  if (e.pointerId !== dragPointerId) return;
  const wasDragging = dragging;
  dragPointerId = undefined;
  pendingDrag = false;
  dragging = false;
  // Clear ownership before release: lostpointercapture may arrive as a result of it.
  if (petContainer.hasPointerCapture(e.pointerId))
    petContainer.releasePointerCapture(e.pointerId);
  ipcRenderer.send(wasDragging ? "drag-end" : "drag-cancel");
  if (wasDragging) {
    interactionFeel?.drop(e.type !== "pointerup");
    companion?.stopDrag();
    suppressNextClick = e.type === "pointerup";
    restoreBasePose();
    if (e.type === "pointerup") companion?.settleDrop();
  }
}
petContainer.addEventListener("pointerup", endDrag);
petContainer.addEventListener("pointercancel", endDrag);
petContainer.addEventListener("lostpointercapture", endDrag);
window.addEventListener("blur", () => {
  if (dragPointerId !== undefined)
    endDrag({ pointerId: dragPointerId, type: "blur" });
});

// 捕获阶段拦掉拖拽结束后的那次 click，免得松手就弹一句台词
petContainer.addEventListener(
  "click",
  (e) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    e.stopPropagation();
    e.preventDefault();
  },
  true,
);

function showPetMood() {
  const s = emotionDirector?.status;
  if (s) showBubble(s.label + " · " + s.text, 5500);
}
function comfortPet() {
  if (playroom?.status?.scene) return playroom.interactScene("comfort");
  emotionDirector?.event("comfort");
  voiceDirector?.stop();
  showBubble("谢谢你…有你在，刚才的小烦恼就轻了很多。", 5000);
}
