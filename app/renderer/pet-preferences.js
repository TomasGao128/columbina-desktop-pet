// Appearance, ambient particles, persistent preferences and startup greeting.
// 用 act 直接引用函数，不用内联 onclick，避免作用域名问题。
// ===== 缩放 / 透明度 =====
// 宠物通过 #petContainer 的固定 top/left 定位，缩放时：
//   · 窗口必须同步变大，否则宠物被裁掉
//   · **以宠物中心为锚点** —— 主进程按这个中心反推窗口位置，宠物就绕自己的中心缩放，
//     不会往右上"长出去"。副产品：宠物中心在屏幕上固定不动，于是"菜单居于桌宠中心"
//     这件事自动成立，拖滑块时菜单也不会跑。
const PET_MARGIN_L = 44; // 与 CSS 的 #petContainer left 一致（须 ≥ 主栏半宽 42）
const PET_MARGIN_B = 70; // 窗口底部留量（须 ≥ 主栏半高 68）
const PET_MARGIN_T = 70; // 宠物头顶留量，放气泡用
const PET_MARGIN_R = 44; // 右侧留量，与左边对称
const PET_WIN_MIN_W = 240; // 窗口最小宽度
const PET_WIN_MIN_H = 240; // 窗口最小高度
const SCALE_MIN = 0.1,
  SCALE_MAX = 3.6,
  SCALE_STEP = 0.1;
const DEFAULT_SCALE = 1.4; // 默认 140%，与主进程初始窗口尺寸匹配
const OPACITY_MIN = 0.3;
// 主栏居中于宠物后，右侧还要放得下最宽的分栏；这个预留量启动时实测校准
let MENU_RESERVE = 184;

let petScale = DEFAULT_SCALE;
let petOpacity = 1;

// 宠物中心的**窗口内**坐标。
// 用 offset* 而不是 getBoundingClientRect()：后者会把元素上动画的 transform（如睡着时的呼吸）
// transform 算进去，量出来的中心每次有 ±1px 抖动，菜单就会跟着抖。
// offset* 是纯布局值、整数，稳定。
function petCenterInWindow() {
  return {
    x: petContainer.offsetLeft + petContainer.offsetWidth / 2,
    y: petContainer.offsetTop + petContainer.offsetHeight / 2,
  };
}

function applyPetStyle() {
  document.documentElement.style.setProperty("--pet-scale", petScale);
  pet.style.opacity = petOpacity;

  // petW/petH 必须在这里现算。offsetWidth/Height 是布局尺寸，不受呼吸动画 transform 影响。
  // ⚠️ 这两个量曾经被删掉却仍在下面使用，导致本函数抛 ReferenceError: petW is not defined；
  // 而它在脚本中段就被调用（启动那次），一抛错后面整段都不再执行 —— 菜单表 MENU、菜单生成、
  // showMainMenu 全都没建起来，表现就是"右键菜单没反应"。改这里时务必确认变量都在。
  const petW = pet.offsetWidth,
    petH = pet.offsetHeight;
  // 图片还没解码完时 offsetHeight 是 0。此时报出去会把主进程的锚点算歪半个宠物高度
  // （实测歪 154px），之后第一次拖缩放滑块宠物会猛地一跳。所以尺寸不可测就不发。
  if (!petW || !petH) return false;
  ipcRenderer.sendSync("apply-pet-style-sync", {
    // 只报「宠物中心相对窗口的偏移」：横向距左边、纵向距底边（与 CSS 的 left / bottom 一致）
    offX: PET_MARGIN_L + petW / 2,
    offYFromTop: PET_MARGIN_T + petH / 2,
    // 宽度要同时满足两件事：① 宠物自己装得下（含左右留量）
    //                        ② 主栏居中于宠物后，右侧还放得下最宽的分栏
    winW: Math.max(
      PET_WIN_MIN_W,
      PET_MARGIN_L +
        petW *
          (["basketball", "cat", "scenery"].includes(playroom?.status?.kind)
            ? 1.65
            : 1) +
        PET_MARGIN_R,
      PET_MARGIN_L + Math.round(petW / 2) + MENU_RESERVE,
    ),
    winH: Math.max(
      PET_WIN_MIN_H,
      PET_MARGIN_T +
        petH +
        (playroom?.status
          ? Math.max(150, playroom.status.panelHeight + 30)
          : PET_MARGIN_B),
    ),
  });
  placeBubble();
  return true;
}
function setScale(s) {
  petScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(s * 10) / 10));
  applyPetStyle();
  saveSettingsSoon();
  rebuildMotesSoon();
}
function setOpacity(o) {
  petOpacity = Math.max(OPACITY_MIN, Math.min(1, Math.round(o * 10) / 10));
  applyPetStyle();
  saveSettingsSoon();
}
const stepScale = (dir) => setScale(petScale + dir * SCALE_STEP);
const stepOpacity = (dir) => setOpacity(petOpacity + dir * 0.1);

// ===== 月光粒子 =====
// 28 个星芒与光点，周期 6–12 秒；负延迟让初次显示就有粒子在半空。
// 几何在缩放结束后重建，避免连续调整尺寸使动画反复重启。
const MOTE_COUNT = 28;
const motesHost = document.getElementById("motes");
let moteRebuildTimer = null;

function buildMotes() {
  motesHost.innerHTML = "";
  if (!motesOn) return;
  const w = petContainer.offsetWidth,
    h = petContainer.offsetHeight;
  if (!w || !h) return; // 图片还没解码完，量不出尺寸就等下次
  for (let i = 0; i < MOTE_COUNT; i++) {
    const el = document.createElement("div");
    el.className = "mote";
    el.style.setProperty("--size", (5 + Math.random() * 9).toFixed(1) + "px");
    el.style.setProperty("--x", (Math.random() * w).toFixed(0) + "px");
    el.style.setProperty(
      "--dx",
      ((Math.random() * 2 - 1) * 26).toFixed(0) + "px",
    );
    el.style.setProperty(
      "--rise",
      (h * (0.55 + Math.random() * 0.55)).toFixed(0) + "px",
    );
    el.style.setProperty("--dur", (6 + Math.random() * 6).toFixed(1) + "s");
    el.style.setProperty("--delay", (-Math.random() * 16).toFixed(1) + "s");
    el.style.setProperty("--peak", (0.4 + Math.random() * 0.35).toFixed(2));
    el.style.left = "var(--x)";
    motesHost.appendChild(el);
  }
}

// 拖缩放滑块会连续改尺寸，粒子几何要跟着重算；但每 tick 都重建会让动画不断重启、
// 看起来像"闪"，所以延后到尺寸稳定再重建一次。
function rebuildMotesSoon() {
  if (moteRebuildTimer) clearTimeout(moteRebuildTimer);
  moteRebuildTimer = setTimeout(buildMotes, 450);
}

function setMotes(on) {
  motesOn = !!on;
  buildMotes();
  saveSettings();
}

// 活跃度：0 安静 / 1 正常 / 2 活泼。只影响走动频率，不改别的手感。
function setActivity(v) {
  activity = Math.max(0, Math.min(2, Math.round(Number(v) || 0)));
  saveSettings();
  showBubble("活跃度：" + ACTIVITY_NAMES[activity]);
}

function setSound(on) {
  if (!on) voiceDirector?.stop();
  soundOn = !!on;
  if (soundOn) playChime(); // 打开时给一声反馈，让用户确认生效
  saveSettings();
}
function setBurstIntensity(value) {
  burstIntensity = Math.max(0, Math.min(2, Math.round(Number(value) || 0)));
  cancelMoonBurst();
  saveSettings();
}
function setReducedMotion(on) {
  document.body.classList.toggle("companion-reduced", !!on);
  reducedMotion = !!on;
  cancelMoonBurst();
  saveSettings();
}

function setClickThrough(on) {
  clickThrough = !!on;
  // 关掉穿透要立刻恢复接收事件，别等下一次 mousemove（否则用户会觉得"没反应"）
  sendIgnore(false); // 面板打开时必须能接收点击（权威仍在主进程）
  saveSettings();
}
function setGazeTracking(on) {
  gazeTracking = !!on;
  companion?.setTracking(gazeTracking);
  saveSettings();
}

// ===== 记住上次的大小 / 透明度 / 音效 =====
// 落在 app/settings.json（由主进程写盘），下次启动原样恢复 ——
// 参考 BongoCat 的「状态记忆」：用户调好的偏好不该每次重启都丢。
let saveTimer = null;
function saveSettings() {
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - companionSessionAt) / 1000),
  );
  companionSeconds = Math.min(1000000000, companionSeconds + elapsed);
  companionSessionAt += elapsed * 1000;
  ipcRenderer.send("save-pet-settings", {
    scale: petScale,
    opacity: petOpacity,
    sound: soundOn,
    clickThrough,
    motes: motesOn,
    burstIntensity,
    reducedMotion,
    gazeTracking,
    controlTuning,
    controlFavorites,
    menuOrder,
    affection,
    activity,
    energy,
    energyAt,
    hunger,
    hungerAt,
    focusMode,
    focusUntil,
    focusMinutes,
    cheatMode,
    interactionCount,
    favoritePose,
    favoriteGame,
    companionSeconds,
    lastSeenAt: Date.now(),
    gameCounts,
    poseCounts,
    voiceOn,
    voiceVolume,
    playRecords,
    emotionMemory,
    basketSlowMotion,
  });
}
// 拖滑块会连续触发，防抖一下，别把磁盘写爆
function saveSettingsSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettings, 400);
}
(function loadSettings() {
  const s = ipcRenderer.sendSync("get-pet-settings") || {};
  const controlPolicy = require("../core/control-settings");
  const orderPolicy = require("../core/menu-order");
  if (orderPolicy.validMenuOrder(s.menuOrder))
    menuOrder = orderPolicy.cloneMenuOrder(s.menuOrder);
  if (controlPolicy.validTuning(s.controlTuning))
    controlTuning = { ...s.controlTuning };
  if (controlPolicy.validFavorites(s.controlFavorites))
    controlFavorites = [...s.controlFavorites];
  controlFavorites = [
    ...new Set(
      controlFavorites.map((id) => id.replace(/^哥伦比娅 coser:/, "换装秀:")),
    ),
  ];
  if (menuOrder.root)
    menuOrder.root = menuOrder.root.map((label) =>
      label === "哥伦比娅 coser" ? "换装秀" : label,
    );
  if (menuOrder["group:哥伦比娅 coser"]) {
    menuOrder["group:换装秀"] = menuOrder["group:哥伦比娅 coser"];
    delete menuOrder["group:哥伦比娅 coser"];
  }
  if (
    typeof s.scale === "number" &&
    s.scale >= SCALE_MIN &&
    s.scale <= SCALE_MAX
  )
    petScale = Math.round(s.scale * 10) / 10;
  if (
    typeof s.opacity === "number" &&
    s.opacity >= OPACITY_MIN &&
    s.opacity <= 1
  )
    petOpacity = Math.round(s.opacity * 10) / 10;
  if (typeof s.sound === "boolean") soundOn = s.sound;
  if (typeof s.clickThrough === "boolean") clickThrough = s.clickThrough;
  if (typeof s.motes === "boolean") motesOn = s.motes;
  if ([0, 1, 2].includes(s.burstIntensity)) burstIntensity = s.burstIntensity;
  if (typeof s.reducedMotion === "boolean") reducedMotion = s.reducedMotion;
  if (typeof s.gazeTracking === "boolean") gazeTracking = s.gazeTracking;
  if (typeof s.affection === "number" && Number.isFinite(s.affection))
    affection = Math.max(0, Math.min(140, Math.round(s.affection)));
  focusMode = s.focusMode === true;
  cheatMode = s.cheatMode === true;
  if (typeof s.voiceOn === "boolean") voiceOn = s.voiceOn;
  if (
    Number.isFinite(s.voiceVolume) &&
    s.voiceVolume >= 0 &&
    s.voiceVolume <= 1
  )
    voiceVolume = s.voiceVolume;
  if (Number.isFinite(s.focusUntil) && s.focusUntil >= 0)
    focusUntil = s.focusUntil;
  if (
    Number.isInteger(s.focusMinutes) &&
    s.focusMinutes >= 0 &&
    s.focusMinutes <= 120
  )
    focusMinutes = s.focusMinutes;
  for (const [key, max] of [
    ["interactionCount", 1000000],
    ["companionSeconds", 1000000000],
    ["favoriteGame", 7],
  ])
    if (Number.isInteger(s[key]) && s[key] >= 0 && s[key] <= max) {
      if (key === "interactionCount") interactionCount = s[key];
      else if (key === "companionSeconds") companionSeconds = s[key];
      else favoriteGame = s[key];
    }
  if (
    Number.isInteger(s.favoritePose) &&
    s.favoritePose >= -1 &&
    s.favoritePose <= 1000
  )
    favoritePose = s.favoritePose;
  const { isValid } = require("../settings-schema.js");
  if (isValid("playRecords", s.playRecords)) playRecords = { ...s.playRecords };
  if (isValid("emotionMemory", s.emotionMemory))
    emotionMemory = { ...s.emotionMemory };
  if (typeof s.basketSlowMotion === "boolean")
    basketSlowMotion = s.basketSlowMotion;
  if (isValid("gameCounts", s.gameCounts)) gameCounts = { ...s.gameCounts };
  if (isValid("poseCounts", s.poseCounts)) poseCounts = { ...s.poseCounts };
  if (Number.isFinite(s.lastSeenAt) && s.lastSeenAt > 0)
    previousSeenAt = s.lastSeenAt;
  document.body.classList.toggle("focus-mode", focusMode);
  document.body.classList.toggle("companion-reduced", reducedMotion);
  if (Number.isInteger(s.activity))
    activity = Math.max(0, Math.min(2, s.activity));
  // ⚠️ 顺序有讲究：**先把两条需求都读进来，再结算**。
  // settleEnergy() 里要读 hungerTier()（饿着掉得更快），如果在 hunger 读入之前结算，
  // 结算时她默认是"饱的"，耦合就只对运行期生效、对"退出那段时间"失效 ——
  // 这个顺序错只有真跑一遍对比数值才会发现（本轮就是这么查出来的）。
  if (Number.isInteger(s.energy))
    energy = Math.max(0, Math.min(ENERGY_MAX, s.energy));
  if (Number.isFinite(s.energyAt) && s.energyAt > 0) energyAt = s.energyAt;
  if (Number.isInteger(s.hunger))
    hunger = Math.max(0, Math.min(HUNGER_MAX, s.hunger));
  if (Number.isFinite(s.hungerAt) && s.hungerAt > 0) hungerAt = s.hungerAt;
  settleEnergy(); // 补算退出期间的衰减：回来时她可能已经困了（饿着会掉得更快）
  settleHunger(); // 同理：回来时她可能已经饿了
})();

// ===== 启动问候 =====
// 台词按**当前好感度档位**挑（四档台词本身就是"按熟悉程度打招呼"的语料），
// 于是"关系变好了"这件事在每次启动时都看得见。
// 1.2 秒延迟是为了不跟启动那一下抢，显得从容。
function greetOnStart() {
  setTimeout(() => {
    if (
      !isPlayingAction &&
      !walking &&
      !focusMode &&
      !voiceDirector?.status.active
    ) {
      if (speakMatched(greetingVoiceContext())) return;
      const remembered =
        !previousSeenAt && affection > 0
          ? ""
          : CompanionPolicy.returnGreeting(
              previousSeenAt,
              Date.now(),
              favoriteGameLabel(),
            );
      if (remembered) {
        showBubble(remembered);
        return;
      }
      const lines = TIER_LINES[tierOf(affection).key];
      showBubble(lines[Math.floor(Math.random() * lines.length)]);
    }
  }, 1200);
}

// 启动时把默认缩放/透明度落到样式上，并把「宠物中心偏移」报给主进程做记账基准。
// 必须**等图片解码完**再报 —— 这个偏移是主进程记的锚点基准，报早了（offsetHeight=0）
// 会把锚点算歪，表现为"一拖缩放滑块宠物就猛地跳一下"。
function primePetStyle(tries) {
  if (applyPetStyle()) {
    // 启动时若已经很困/睡着，就别打招呼了，直接睡（睡觉本身会说话）
    if (energyTier() === "asleep") setTimeout(fallAsleep, 600);
    else if (!focusMode) greetOnStart();
    buildMotes();
    return;
  }
  if ((tries || 0) < 60) setTimeout(() => primePetStyle((tries || 0) + 1), 20);
}
