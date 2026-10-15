// Loaded before the main script; functions consume its state after initialization.
const relationNotificationTimers = new Set();
function contentIds(kind) {
  return kind === "action"
    ? CompanionPolicy.ACTION_ORDER
    : kind === "coser"
      ? COSER_POSES.map((p) => p.id)
      : USER_POSES.map((p) => p.id);
}
function availableContent(kind, aff = affection, count = interactionCount) {
  return CompanionPolicy.unlockedIds(kind, contentIds(kind), aff, count);
}
function contentUnlocked(kind, id) {
  return availableContent(kind).includes(id);
}
function showLockedContent() {
  showBubble("这一份月光…还需要我们再熟悉一点。");
}
function visibleMenuItems(group) {
  if (!["动作", "姿势", "换装秀"].includes(group.label)) return group.items;
  const kind =
      group.label === "动作"
        ? "action"
        : group.label === "换装秀"
          ? "coser"
          : "pose",
    ids = availableContent(kind);
  const items = ids
    .map((id) => group.items.find((it) => it.contentId === id))
    .filter(Boolean);
  if (kind === "pose" && favoritePose >= 0)
    items.sort(
      (a, b) => (b.contentId === favoritePose) - (a.contentId === favoritePose),
    );
  return items;
}
function refreshGrowthMenus() {
  for (const label of ["动作", "姿势", "换装秀"]) {
    const group = MENU.find((g) => g.label === label);
    if (group?.el)
      group.el.innerHTML =
        group.icon +
        " " +
        label +
        `<small> ${visibleMenuItems(group).length}/${group.items.length}</small><span class="arw">▸</span>`;
  }
  const burst = MENU.find((g) => g.label === "大招");
  if (burst?.el)
    burst.el.style.display = contentUnlocked("action", "burst") ? "" : "none";
}
function recordCompanionship(kind, id) {
  emotionDirector?.event("care");
  if (Date.now() - lastInteractionAt < 2000) return false;
  lastInteractionAt = Date.now();
  interactionCount = Math.min(1000000, interactionCount + 1);
  if (kind === "game" && CompanionPolicy.GAMES.includes(id)) {
    gameCounts[id] = Math.min(1000000, (gameCounts[id] || 0) + 1);
    favoriteGame = CompanionPolicy.GAMES.reduce(
      (best, key, i) =>
        (gameCounts[key] || 0) > (gameCounts[CompanionPolicy.GAMES[best]] || 0)
          ? i
          : best,
      0,
    );
  }
  if (kind === "pose" && USER_POSES.some((p) => p.id === id))
    poseCounts[id] = Math.min(1000000, (poseCounts[id] || 0) + 1);
  saveSettingsSoon();
  refreshGrowthMenus();
  return true;
}
function favoriteGameLabel() {
  const labels = {
    cake: "吃蛋糕",
    badminton: "打羽毛球",
    ball: "玩软球",
    sing: "听歌",
    pinch: "捏捏脸",
    feather: "接羽毛",
    shoulder: "轻拍肩膀",
    chatter: "聊聊天",
  };
  const key = CompanionPolicy.GAMES[favoriteGame];
  return gameCounts[key] ? labels[key] : "";
}
function rememberedPose() {
  const available = USER_POSES.filter((p) => contentUnlocked("pose", p.id));
  return (
    available.find((p) => p.id === favoritePose) ||
    available
      .filter((p) => poseCounts[p.id])
      .sort((a, b) => poseCounts[b.id] - poseCounts[a.id])[0] ||
    null
  );
}
function relationNoticeData(tier, preview = false) {
  const previousTier = TIERS[Math.max(0, TIERS.indexOf(tier) - 1)];
  const previousActions = availableContent("action", previousTier.min);
  const previousPoses = availableContent("pose", previousTier.min);
  const newActions = availableContent("action", tier.min)
    .filter((id) => !previousActions.includes(id))
    .map((id) => ({
      id,
      label:
        MENU.find((group) => group.label === "动作")?.items.find(
          (item) => item.contentId === id,
        )?.label || id,
      frame:
        SMOOTH_ACTIONS[id]?.frames[0] ||
        (id === "burst" ? "./burst-canonical.png" : null),
    }));
  const newPoses = availableContent("pose", tier.min)
    .filter((id) => !previousPoses.includes(id))
    .map((id) => USER_POSES.find((pose) => pose.id === id))
    .filter(Boolean);
  const newCosers = availableContent("coser", tier.min)
    .filter((id) => !availableContent("coser", previousTier.min).includes(id))
    .map((id) => COSER_POSES.find((p) => p.id === id));
  return {
    cosers: availableContent("coser", tier.min).length,
    totalCosers: COSER_POSES.length,
    newCosers,
    tier,
    line: LEVELUP_LINES[Math.floor(Math.random() * LEVELUP_LINES.length)],
    actions: availableContent("action", tier.min).length,
    poses: availableContent("pose", tier.min).length,
    totalActions: contentIds("action").length,
    totalPoses: USER_POSES.length,
    newActions,
    newPoses,
    preview,
  };
}

function announceRelationChange(before, after) {
  if (after.min <= before.min) return;
  refreshGrowthMenus();
  for (const tier of TIERS.filter(
    (t) => t.min > before.min && t.min <= after.min,
  )) {
    const timer = setTimeout(() => {
      relationNotificationTimers.delete(timer);
      lifeUI?.levelUp(relationNoticeData(tier));
    }, 120);
    relationNotificationTimers.add(timer);
  }
}
function previewRelationCeremony() {
  const current = tierOf(affection);
  lifeUI?.levelUp(relationNoticeData(current.min ? current : TIERS[1], true));
}
function setFocusMode(on, minutes = focusMinutes, completed = false) {
  if (on) releaseEdgePeek();
  focusMode = !!on;
  if (focusMode) {
    focusMinutes = [0, 25, 45].includes(minutes) ? minutes : 25;
    focusUntil = focusMinutes ? Date.now() + focusMinutes * 60000 : 0;
    bubble.style.display = "none";
  } else focusUntil = 0;
  document.body.classList.toggle("focus-mode", focusMode);
  stopWalking();
  cancelAction({ preserveVoice: completed && voiceDirector?.status.story });
  companion?.releaseLook();
  restoreBasePose();
  updateStateBadge();
  saveSettingsSoon();
  if (!focusMode) {
    const text = completed
      ? "这一段专注结束了…伸个懒腰吧。"
      : "嗯…现在可以一起玩了。";
    if (completed && voiceDirector?.status.story) deferVoiceNotice(text);
    else showBubble(text);
  }
}
function setCheatMode(on) {
  cheatMode = !!on;
  saveSettingsSoon();
}
function adjustCompanionValue(key, value) {
  if (
    !cheatMode ||
    !["affection", "energy", "hunger", "interactionCount"].includes(key) ||
    !Number.isFinite(value)
  )
    return false;
  const max = key === "affection" ? 140 : 100;
  value = Math.max(0, Math.min(max, Math.round(value)));
  if (key === "affection") {
    const before = tierOf(affection);
    affection = value;
    announceRelationChange(before, tierOf(affection));
  }
  if (key === "interactionCount") interactionCount = value;
  if (key === "hunger") {
    hunger = value;
    hungerAt = Date.now();
  }
  if (key === "energy") {
    energy = value;
    energyAt = Date.now();
    if (value <= ENERGY_ASLEEP) fallAsleep();
    else if (sleeping) {
      sleeping = false;
      sleepPose = null;
      cancelAction();
      restoreBasePose();
    }
  }
  refreshGrowthMenus();
  updateStateBadge();
  saveSettingsSoon();
  return true;
}
function openLifePanel(mode) {
  hideMenus();
  lifeUI?.open(mode);
}
function companionshipState() {
  return {
    focused: focusMode,
    focusUntil,
    focusMinutes,
    cheat: cheatMode,
    reduced: reducedMotion,
    affection,
    energy,
    hunger,
    interactionCount,
    interactions: interactionCount,
    seconds:
      companionSeconds +
      Math.max(0, Math.floor((Date.now() - companionSessionAt) / 1000)),
    favoritePoseLabel: rememberedPose()?.label,
    favoriteGameLabel: favoriteGameLabel(),
    tier: tierOf(affection),
    actionCount: availableContent("action").length,
    poseCount: availableContent("pose").length,
    coserCount: availableContent("coser").length,
    totalCosers: COSER_POSES.length,
    totalActions: contentIds("action").length,
    totalPoses: USER_POSES.length,
  };
}
function initializeCompanionship() {
  const { installCompanionshipUI } = require("./companionship-ui.js");
  lifeUI = installCompanionshipUI({
    state: companionshipState,
    previewRelation: previewRelationCeremony,
    celebrateRelation: (data) => {
      releaseEdgePeek();
      cancelAction();
      hideMenus();
      bubble.style.display = "none";
      return require("./pet-relation-celebration").createPetRelationCelebration(
        petContainer,
        {
          tier: data.tier.name,
          line: data.line,
          maximum: data.tier.min >= 140,
          preview: data.preview,
          reduced:
            reducedMotion ||
            matchMedia("(prefers-reduced-motion: reduce)").matches,
        },
      );
    },
    focus: setFocusMode,
    cheat: setCheatMode,
    adjust: adjustCompanionValue,
    playFavorite: () => {
      const pose = rememberedPose();
      if (pose) playUserPose(pose.id);
    },
    modalChanged: () => {
      ipcRenderer.send("menu-state", menuOpen || lifeUI?.modalActive || false);
      if (lifeUI?.modalActive) sendIgnore(false);
    },
  });
  refreshGrowthMenus();
  if (focusMode) restoreBasePose();
  updateStateBadge();
  ipcRenderer.send("menu-state", false);
  // Growth counts and thumbnail grids are wider than the startup placeholder menu.
  // Measure after real labels exist, then apply the actual window reservation once.
  const oldDisplay = rightMenu.style.display,
    oldVisibility = rightMenu.style.visibility;
  rightMenu.style.visibility = "hidden";
  rightMenu.style.display = "block";
  MENU_RESERVE =
    Math.ceil(rightMenu.offsetWidth / 2) + measureMaxSubWidth() + 20;
  rightMenu.style.display = oldDisplay;
  rightMenu.style.visibility = oldVisibility;
  applyPetStyle();
  const tick = setInterval(() => {
    if (focusMode && focusUntil > 0 && Date.now() >= focusUntil) {
      setFocusMode(false, focusMinutes, true);
      lifeUI.refresh();
    }
  }, 1000);
  const save = setInterval(saveSettings, 15000);
  window.addEventListener(
    "beforeunload",
    () => {
      saveSettings();
      clearInterval(tick);
      clearInterval(save);
      for (const timer of relationNotificationTimers) clearTimeout(timer);
      relationNotificationTimers.clear();
      lifeUI.dispose();
    },
    { once: true },
  );
}
