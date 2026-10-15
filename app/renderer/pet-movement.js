// ===== 自主走动 =====
// 左走和右走是**两套独立动作**，一次走动只能用一个方向 —— 绝不中途换套（哪怕撞到屏幕边）。
// 时长按时间算（一次至少 WALK_MIN_MS），所以出发前先问主进程左右两边各剩多少空间，
// 挑一个够走完全程的方向；两边都够就随机挑。位移交给主进程算（walk-step-sync）。
// 帧列表在文件上方统一定义（WALK_LEFT / WALK_RIGHT），这里不再重复定义
const WALK_STEP_PX = 4,
  WALK_MIN_MS = 13000; // 步长取偶数：150% 缩放下只有偶数 DIP 才是整数物理像素，否则会被系统吸附吃掉
// 位移每 WALK_STEP_MS 一步；素材帧按 WALK_FRAME_MS 更新，动画速度与移速分离。
const WALK_NEED_PX = Math.ceil(WALK_MIN_MS / WALK_STEP_MS) * WALK_STEP_PX;

let walkLease = null;
function stopWalking({ restIfTired = false } = {}) {
  if (walkTimer) {
    clearInterval(walkTimer);
    walkTimer = null;
  }
  if (walkFrameTimer) {
    clearInterval(walkFrameTimer);
    walkFrameTimer = null;
  }
  if (!walking) return;
  walking = false;
  walkLease?.finish();
  walkLease = null;
  const walkedMs = Math.min(
    WALK_MIN_MS,
    Math.max(0, Date.now() - walkStartedAt),
  );
  walkingFatigueMs += walkedMs;
  settleEnergy();
  energy = Math.max(0, energy - Math.round(walkedMs / 3000));
  pet.src = companion?.idleFrame || "./frame-1.webp";
  ipcRenderer.send("save-pos"); // 走到哪儿了要记住，下次启动接着那儿
  saveSettingsSoon();
  if (restIfTired) {
    if (energyTier() === "asleep") fallAsleep();
    else if (
      walkingFatigueMs >= WALK_REST_THRESHOLD_MS ||
      energyTier() === "sleepy"
    )
      takeShortRest("walk");
  }
}

async function startWalking(preInfo) {
  if (edgeSide || focusMode || lifeUI?.active || voiceDirector?.status.active)
    return false;
  // 播动作中、被拖拽中、菜单开着，都不该自己走
  if (
    walking ||
    walkPreparing ||
    sleeping ||
    resting ||
    isPlayingAction ||
    dragging ||
    menuOpen
  )
    return;
  walkPreparing = true;
  const preparationVersion = actionPlayer.version;
  try {
    await WALK_FRAMES_READY;
  } catch (_) {
    walkPreparing = false;
    return;
  }
  walkPreparing = false;
  if (preparationVersion !== actionPlayer.version) return false;
  // 图片预载期间如果用户开始了互动/拖拽/睡眠，就放弃这次自主走动。
  if (
    walking ||
    sleeping ||
    resting ||
    isPlayingAction ||
    dragging ||
    menuOpen ||
    focusMode ||
    lifeUI?.active ||
    voiceDirector?.status.active
  )
    return;
  // 先看两边空间。工作区宽度远大于一趟移动需要的距离，所以至少有一边够 ——
  // 挑够用的那边，实在都够就随机；都够就随机挑，保证能走满 13 秒不撞边。
  // preInfo 是决策阶段已经问过的那次结果，避免为了同一件事再问一遍主进程。
  const room = preInfo ||
    ipcRenderer.sendSync("walk-begin") || { leftRoom: 0, rightRoom: 0 };
  const canRight = room.rightRoom >= WALK_NEED_PX;
  const canLeft = room.leftRoom >= WALK_NEED_PX;
  const goRight = canRight && canLeft ? Math.random() > 0.5 : canRight;
  walkLease = actionPlayer.acquire(goRight ? "walk-right" : "walk-left", {
    automatic: true,
    priority: 10,
    cleanup: () => stopWalking(),
  });
  if (!walkLease) return false;
  walking = true;
  speakMatched("walk", { automatic: true });
  companion?.releaseLook();
  const frames = goRight ? WALK_RIGHT : WALK_LEFT; // 方向定死，全程只播这一套
  const landingFrames = goRight
    ? WALK_LANDING_FRAMES.right
    : WALK_LANDING_FRAMES.left;
  const landings = new Set(landingFrames);
  const walkClock = performance.now();
  let movedSteps = 0;
  let displayedWalkIndex = -1;
  const startedAt = Date.now();
  walkStartedAt = startedAt;
  const renderWalkFrame = () => {
    const index =
      Math.floor((performance.now() - walkClock) / WALK_FRAME_MS) %
      frames.length;
    if (index === displayedWalkIndex) return;
    displayedWalkIndex = index;
    pet.src = frames[index];
    if (landings.has(index))
      triggerFootRipple(
        getLandingSide(landingFrames, index),
        getLandingContact(goRight ? "walk-right" : "walk-left", index),
      );
  };
  renderWalkFrame();
  walkFrameTimer = setInterval(() => {
    if (!walking) return;
    renderWalkFrame();
  }, WALK_FRAME_MS);
  walkTimer = setInterval(() => {
    const dueSteps = Math.floor(
      Math.min(WALK_MIN_MS, performance.now() - walkClock) / WALK_STEP_MS,
    );
    const delta = dueSteps - movedSteps;
    if (delta <= 0) return;
    movedSteps = dueSteps;
    const r = ipcRenderer.sendSync(
      "walk-step-sync",
      (goRight ? WALK_STEP_PX : -WALK_STEP_PX) * delta,
    );
    // 万一还是撞到边就收工 —— 绝不掉头去播另一套动作
    if (r && (goRight ? r.hitRight : r.hitLeft)) {
      stopWalking({ restIfTired: true });
      return;
    }
    if (Date.now() - startedAt >= WALK_MIN_MS)
      stopWalking({ restIfTired: true });
  }, WALK_STEP_MS);
}

// 每隔一段时间掷一次骰子，不是每次必走。
//
// 概率由「光标离她多远」决定（用户点名要的手感）：她身上/旁边 = 你正在和她玩，
// 走开很讨厌 → 概率低一些；光标跑到远处 = 你在别处干活 → 走得勤，显得有生气。
// 距离由主进程在 walk-begin 里顺带回报（getCursorScreenPoint 已是 DIP，不需折算）。
// 2026-10-07 调参：用户反馈"概率低了"。原因是平时光标多半离她不远，落在低概率区；
// 所以两端一起提，并把"远处"的门槛从 900 拉到 550，让常见距离也能落到高概率段。
const WALK_NEAR_DIP = 100; // 认为"就在身边"的距离
const WALK_FAR_DIP = 550; // 认为"在忙别的"的距离（拉近，覆盖常见工作距离）
const WALK_P_NEAR = 0.25; // 贴着她时每 30 秒的走动概率
const WALK_P_FAR = 0.85; // 光标很远时的概率
let lastWalkChance = null; // 仅供调试快照观测
let lastCursorDist = null;

// 纯函数：距离 → 概率。单独拆出来是为了能被冒烟测试直接断言（单调、有界）。
function walkChance(dist) {
  if (!Number.isFinite(dist)) return 0.5; // 拿不到距离就退回原来的 50%
  const t = Math.max(
    0,
    Math.min(1, (dist - WALK_NEAR_DIP) / (WALK_FAR_DIP - WALK_NEAR_DIP)),
  );
  const eased = t * t * (3 - 2 * t); // smoothstep：近处压得平，远处才能拉满
  return WALK_P_NEAR + (WALK_P_FAR - WALK_P_NEAR) * eased;
}

// 活跃度系数与"距离曲线 × 活跃度"的合成（声明位置见文件上方的状态区）
function activityMul() {
  return ACTIVITY_MUL[activity] || 1;
}
// 距离曲线 × 活跃度系数，并夹住上限（再活泼也别变成一直在走）
function effectiveWalkChance(dist) {
  const base = walkChance(dist) * activityMul();
  return Math.max(0, Math.min(0.95, base));
}

// 调试模式（主进程带 PET_DEBUG=1 启动）下禁止自主走动：自动化交互测试靠合成鼠标点击，
// 桌宠一走窗口就挪位，测试全部点空，还会得出"点击失效"的错误结论。
// ⚠️ `debugNoWalk` 必须在**回调里**判断：写在注册时求值的话，那一刻调试标志还没送达，
// 定时器照样注册上了，等于没禁（本轮实测踩到，白白多测了两轮）。
setInterval(() => {
  // 先算决策值，再决定要不要真的走 —— 调试模式下只禁"动作"、不禁"计算"，
  // 这样 lastCursorDist / lastWalkChance 在调试快照里始终可观测（否则没法验证）。
  const info = ipcRenderer.sendSync("walk-begin") || {};
  lastCursorDist = Number.isFinite(info.cursorDist) ? info.cursorDist : null;
  let p = effectiveWalkChance(info.cursorDist);
  // 刚互动过就稍微收敛一点（20 秒内概率 ×0.6）—— 刚陪她玩完就起身走了会很出戏。
  // 2026-10-07 从 ×0.5 放宽到 ×0.6：用户反馈整体偏安静，这一项也在压概率。
  if (Date.now() - lastAffectionAt < AFFECTION_GAP_MS) p *= 0.6;
  lastWalkChance = Number(p.toFixed(3));
  if (
    debugNoWalk ||
    focusMode ||
    lifeUI?.active ||
    voiceDirector?.status.active
  )
    return;
  // 能不能自己走动，由状态表统一回答（睡着时不能走）——
  // 这里曾经散着写 if (sleeping)，加需求轴后必须收到一处，否则每加一轴都要回来补判断。
  if (!STATE_TABLE[currentState()].canWalk) return;
  if (walking || isPlayingAction || dragging || menuOpen) return;
  if (trySleepyAnimation()) return;
  if (
    Date.now() - lastRestEndedAt >= REST_COOLDOWN_MS &&
    Math.random() < idleRestChance()
  ) {
    takeShortRest("idle");
    return;
  }
  if (Math.random() < p) startWalking(info);
}, 30000);

let burstLease = null;
let burstActive = false;
let burstId = 0;
let burstLastAt = 0;
function endMoonBurst() {
  burstLease?.finish();
  burstLease = null;
  burstActive = false;
  pet.classList.remove("burst-hidden");
  isPlayingAction = false;
  restoreBasePose();
}
function cancelMoonBurst() {
  if (!burstActive) return;
  const id = burstId;
  endMoonBurst();
  ipcRenderer.send("burst-cancel", id);
}
async function playMoonBurst() {
  if (!burstActive && !contentUnlocked("action", "burst")) {
    showLockedContent();
    return false;
  }
  if (resting) cancelAction();
  if (burstActive) {
    cancelMoonBurst();
    restoreBasePose();
    return;
  }
  if (dragging) return;
  if (isPlayingAction) cancelAction();
  if (Date.now() - burstLastAt < 9000) {
    showBubble("让羽光歇一会儿…");
    return;
  }
  releaseEdgePeek();
  stopWalking();
  if (sleeping) touchEnergy();
  hideMenus();
  bubble.style.display = "none";
  window.petAppearance?.syncPose();
  const rect = pet.getBoundingClientRect();
  const id = ++burstId;
  burstLease = actionPlayer.acquire("burst", { cleanup: cancelMoonBurst });
  if (!burstLease) return false;
  burstActive = true;
  isPlayingAction = true;
  burstLastAt = Date.now();
  companion?.releaseLook();
  try {
    const started = await ipcRenderer.invoke("burst-start", {
      id,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      opacity: petOpacity,
      sound: soundOn,
      intensity: burstIntensity,
      reducedMotion,
    });
    if (started && burstActive && burstId === id && burstLease?.active) {
      recordCompanionship("action", "burst");
      addAffection(1);
      const feedback = require("../core/menu-feedback").chooseMenuFeedback(
        "burst",
        [],
      );
      if (feedback.textOnly) {
        voiceDirector?.stop();
        showBubble(pickFeedback("burst", feedback.lines));
      } else if (!speakMatched("action:burst")) {
        showBubble(
          pickFeedback(
            "burst",
            require("../core/menu-feedback").additionalLines("burst"),
          ),
        );
      }
    }
    if (!started && burstActive && burstId === id) {
      endMoonBurst();
      showBubble("羽光暂时没准备好…");
    }
  } catch (error) {
    if (burstActive && burstId === id) {
      endMoonBurst();
      showBubble("羽光暂时没准备好…");
    }
    console.warn("Moon burst unavailable:", error.message);
  }
}
ipcRenderer.on("burst-started", (_event, payload) => {
  if (burstActive && payload.id === burstId) pet.classList.add("burst-hidden");
});
ipcRenderer.on("burst-finished", (_event, payload) => {
  if (burstActive && payload.id === burstId) endMoonBurst();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && burstActive) {
    cancelMoonBurst();
    restoreBasePose();
  }
});

// ===== 调试快照 =====
// 主进程带 PET_DEBUG=1 启动时会定时来问一次。渲染层的内部状态从外面**完全看不见**：
// 用户说"点了没反应"时，到底是点击根本没送达窗口（卡在点击穿透）、
// 还是卡在"正在播动作"/"正在拖拽"导致所有 handler 提前 return ——
// 只有把这份快照打出来才能区分，否则只能靠猜。
ipcRenderer.on("debug-mode", () => {
  debugNoWalk = true;
});
ipcRenderer.on("debug-save", () => {
  saveSettings();
});
// 调试用：模拟一次互动（等价于用户摸了她一下），用于确定性验证「睡着 → 醒来」这条路径。
// 合成鼠标点击在真实环境里不可靠，睡眠/唤醒这种状态切换不该依赖它来验证。
ipcRenderer.on("debug-touch", () => {
  touchEnergy();
});

ipcRenderer.on("debug-request", () => {
  ipcRenderer.send("debug-report", {
    clicks: statClicks,
    downs: statDowns,
    walkChance: lastWalkChance,
    activity,
    energy,
    hunger,
    state: currentState(),
    sleeping,
    personaLinesFrom,
    personaSections: personaSections ? Object.keys(personaSections).length : 0,
    cursorDist: lastCursorDist,
    moves: statMoves,
    affection,
    tier: tierOf(affection).name,
    moveLog,
    rendererWin: [
      window.screenX,
      window.screenY,
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio,
    ],
    isPlayingAction,
    actionLifecycle: actionPlayer.status || null,
    imageCache: preloadFrames.status,
    walking,
    dragging,
    pendingDrag,
    dragId: dragPointerId === undefined ? -1 : dragPointerId,
    ignoringMouse,
    clickThrough,
    menuOpen,
    src: String(pet.src).split("/").pop(),
    scale: petScale,
    // 光标当前位置**实际命中的元素**是谁：排查"点了没反应"时这一项最直接
    // （比如光标在人物身上、命中的却是 img 而不是 headZone，那就是层级被盖住了）
    under: lastMouse
      ? (document.elementFromPoint(lastMouse.x, lastMouse.y) || {}).id ||
        "(无 id)"
      : "(没有鼠标位置)",
    // 三个部位各自几何中心**实际命中的元素**：不依赖鼠标输入，直接验层级顺序对不对。
    // 曾经 #pet 的 z-index:1 盖住了没有 z-index 的三个区域，这一项会显示成 pet。
    hitProbe: (() => {
      const mid = (el) => {
        const b = el.getBoundingClientRect();
        return [
          Math.round(b.left + b.width / 2),
          Math.round(b.top + b.height / 2),
        ];
      };
      const at = (p) => {
        const el = document.elementFromPoint(p[0], p[1]);
        return el ? el.id || el.tagName.toLowerCase() : "null";
      };
      return {
        head: at(mid(headZone)),
        belly: at(mid(bellyZone)),
        foot: at(mid(footZone)),
      };
    })(),
    // 三个点击区域与人物框的**真实**视口矩形：验证层级与百分比定位是否符合预期
    geom: (() => {
      const r = (el) => {
        const b = el.getBoundingClientRect();
        return [
          Math.round(b.left),
          Math.round(b.top),
          Math.round(b.width),
          Math.round(b.height),
        ];
      };
      return {
        container: r(petContainer),
        head: r(headZone),
        belly: r(bellyZone),
        foot: r(footZone),
        pet: r(pet),
        mouse: lastMouse
          ? [Math.round(lastMouse.x), Math.round(lastMouse.y)]
          : null,
      };
    })(),
  });
});
