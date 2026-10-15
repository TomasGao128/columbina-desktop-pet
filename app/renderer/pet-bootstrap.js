// Start only after all renderer definitions are loaded.
actionCatalog = require("../core/action-catalog.js").createActionCatalog({
  clips: SMOOTH_ACTIONS,
  companions: COMPANION_ACTIONS,
  poses: USER_POSES,
  cosers: COSER_POSES,
  moods: MOODS,
  sleepPoses: SLEEP_POSES,
  activities: require("./playroom-assets.json"),
  locomotion: {
    "walk-left": { frames: WALK_LEFT, frameMs: WALK_FRAME_MS },
    "walk-right": { frames: WALK_RIGHT, frameMs: WALK_FRAME_MS },
    "run-left": { frames: RUN_LEFT, frameMs: RUN_FRAME_MS },
    "run-right": { frames: RUN_RIGHT, frameMs: RUN_FRAME_MS },
  },
});
actionPlayer = require("../core/animation-director.js").createAnimationDirector(
  {
    player: actionPlayer,
    catalog: actionCatalog,
  },
);
const bodyHitController = require("./body-hit-runtime").installBodyHit({
  image: pet,
  container: petContainer,
  ipc: ipcRenderer,
  sample: () => playroom?.bodySource ?? null,
  protectedState: () =>
    dragging || pendingDrag || menuOpen || !!lifeUI?.modalActive,
});
let dizzyLease = null;
const idleCloth = installIdleCloth({ image: pet, canAnimate: () => false });
const { installCompanion } = require("./companion-interactions.js");
companion = installCompanion({
  image: pet,
  container: petContainer,
  loadFrames: preloadFrames,
  manifest: COMPANION_ACTIONS,
  state: () => ({
    dragging,
    edgePreview: interactionFeel?.status.preview,
    edgeDocked: !!edgeSide,
    reducedMotion,
    gazeSpeed: controlTuning.gazeSpeed,
    canLook:
      !edgeSide &&
      !focusMode &&
      !lifeUI?.active &&
      !voiceDirector?.status.story &&
      !sleeping &&
      !resting &&
      !isPlayingAction &&
      !walking &&
      !dragging &&
      !pendingDrag &&
      !menuOpen &&
      !burstActive &&
      (companion?.gazeActive ||
        pet.src.endsWith("frame-1.webp") ||
        pet.src.endsWith(companion?.idleFrame?.slice(2) || "never")),
  }),
  badmintonFactory: require("./badminton-effect.js").installBadmintonEffect,
  restore: restoreBasePose,
  sound: () => soundOn && !(voiceOn && voiceDirector?.status.active),
  tracking: gazeTracking && process.env.PET_QA_DISABLE_GAZE !== "1",
});
function updateCompanionCursor(_event, point) {
  companion.setCursor(point);
}
ipcRenderer.on("companion-cursor", updateCompanionCursor);
ipcRenderer.send("request-companion-cursor");
window.petAppearance = idleCloth;
petReactions = require("./pet-reactions.js").installPetReactions({
  container: petContainer,
  image: pet,
  hit: (target) => [pet, headZone, bellyZone, footZone].includes(target),
  allowed: () =>
    !dragging &&
    !pendingDrag &&
    !suppressNextClick &&
    !sleeping &&
    !resting &&
    !focusMode &&
    !menuOpen &&
    !lifeUI?.active &&
    !burstActive,
  reduced: () =>
    reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches,
  begin: () => {
    releaseEdgePeek();
    cancelAction();
    stopWalking();
    companion?.releaseLook();
    dizzyLease = actionPlayer.acquire("dizzy", {
      priority: 80,
      cleanup: () => {
        petReactions?.cancel();
        isPlayingAction = false;
        restoreBasePose();
      },
    });
    isPlayingAction = true;
    showBubble("星星…怎么绕起来了？让我歇一会儿。", 2800);
  },
  finish: () => {
    dizzyLease?.finish();
    dizzyLease = null;
    isPlayingAction = false;
    restoreBasePose();
  },
});
function onPetEdge(_event, side) {
  showEdgePeek(side);
  petReactions.edge(side);
}
ipcRenderer.on("pet-edge-snapped", onPetEdge);
initializeCompanionship();
initializeVoices();
moonEffects = require("./moon-effects.js").installMoonEffects({
  container: petContainer,
  reduced: () =>
    reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches,
  focused: () => focusMode,
  opacity: () => petOpacity,
});
emotionDirector = require("./emotion-runtime").installEmotion({
  autonomous: false,
  saved: emotionMemory,
  onSave: (s) => {
    emotionMemory = s;
    saveSettingsSoon();
  },
  speak: (text) => showBubble(text, 5000),
  canSpeak: () =>
    !focusMode &&
    !sleeping &&
    !isPlayingAction &&
    !dragging &&
    !menuOpen &&
    !lifeUI?.modalActive,
});
emotionMemory = {
  mood: emotionDirector.status.mood,
  wins: emotionDirector.status.wins,
  losses: emotionDirector.status.losses,
  lastCareAt: emotionDirector.status.lastCareAt,
  updatedAt: emotionDirector.status.updatedAt,
  until: emotionDirector.status.until,
};
playroom = require("./playroom").installPlayroom({
  image: pet,
  container: petContainer,
  director: actionPlayer,
  prepare: preloadFrames,
  assets: require("./playroom-assets.json"),
  ipc: ipcRenderer,
  sound: () => soundOn,
  emotion: (kind, detail) => emotionDirector.event(kind, detail),
  mood: () => emotionDirector.status,
  records: () => playRecords,
  record: (kind, result) => {
    const before = JSON.stringify(playRecords);
    playRecords = require("../core/emotion-memory").updateRecords(
      playRecords,
      kind,
      result,
    );
    if (before !== JSON.stringify(playRecords)) {
      saveSettingsSoon();
      return true;
    }
    return false;
  },
  slowMotion: () => basketSlowMotion,
  setSlowMotion: (value) => {
    basketSlowMotion = !!value;
    saveSettingsSoon();
  },
  reduced: () =>
    reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches,
  layout: () => {
    applyPetStyle();
    ipcRenderer.send("ensure-pet-visible");
  },
  begin: () => {
    if (dragging || pendingDrag) return false;
    if (focusMode) {
      showBubble("先完成这一段专注…我们再一起玩。");
      return false;
    }
    releaseEdgePeek();
    cancelAction();
    if (sleeping) touchEnergy();
    lifeUI?.close();
    hideMenus();
    companion?.releaseLook();
    isPlayingAction = true;
    return true;
  },
  ended: () => {
    isPlayingAction = false;
    restoreBasePose();
  },
  speak: (text) => {
    voiceDirector?.stop();
    showBubble(text, 4500);
  },
  reward: (kind) => {
    recordCompanionship("other", kind);
    addAffection(1);
  },
});
window.addEventListener(
  "beforeunload",
  () => {
    bodyHitController.dispose();
    playroom.dispose();
    emotionDirector.dispose();
    actionPlayer.dispose();
    preloadFrames.clear();
    ipcRenderer.removeListener("pet-edge-snapped", onPetEdge);
    petReactions.dispose();
    ipcRenderer.removeListener("companion-cursor", updateCompanionCursor);
    companion.dispose();
    idleCloth.dispose();
    moonEffects.dispose();
  },
  { once: true },
);
primePetStyle();

ipcRenderer.on("display-layout-changed", () => {
  cancelAction();
  if (dragPointerId !== undefined)
    endDrag({ pointerId: dragPointerId, type: "blur" });
});

ipcRenderer.on("pet-edge-cleared", () => {
  edgeSide = null;
  delete petContainer.dataset.edge;
  restoreBasePose();
});
const savedEdge = ipcRenderer.sendSync("get-pet-edge");
if (savedEdge) showEdgePeek(savedEdge);
let strokeLease = null,
  lastStrokeReward = -Infinity;
interactionFeel = require("./interaction-feel").installInteractionFeel({
  container: petContainer,
  image: pet,
  head: headZone,
  ipc: ipcRenderer,
  allowed: (holding) =>
    !focusMode &&
    !sleeping &&
    !resting &&
    !dragging &&
    !walking &&
    !menuOpen &&
    !lifeUI?.modalActive &&
    !burstActive &&
    (!isPlayingAction || (!!holding && !!strokeLease?.active)),
  reduced: () =>
    reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches,
  edgeSide: () => edgeSide,
  edgeFrame: (side) => EDGE_PEEKS[side].frame,
  tuning: () => controlTuning,
  beginHold: () => {
    cancelAction({ preserveFeel: true });
    releaseEdgePeek();
    dragPointerId = undefined;
    pendingDrag = false;
    ipcRenderer.send("drag-cancel");
    strokeLease = actionPlayer.acquire("head-stroke", {
      priority: 70,
      cleanup: () => {
        isPlayingAction = false;
        restoreBasePose();
      },
    });
    if (!strokeLease) return false;
    isPlayingAction = true;
    ipcRenderer.send("stroke-capture", true);
    voiceDirector.stop();
    const lease = strokeLease;
    preloadFrames(HEAD_FRAMES)
      .then(() => {
        if (lease.active) pet.src = HEAD_FRAMES.at(-1);
      })
      .catch(() => {
        if (lease.active) interactionFeel.cancel();
      });
    showBubble(
      pickFeedback("head-hold", [
        "唔…这样轻轻摸着就好。",
        "呵呵，发梢有一点痒。",
        "可以呀，别把发饰碰歪了。",
      ]),
      5000,
    );
    return true;
  },
  endHold: (travel) => {
    ipcRenderer.send("stroke-capture", false);
    strokeLease?.finish();
    strokeLease = null;
    isPlayingAction = false;
    restoreBasePose();
    suppressNextClick = true;
    if (Date.now() - lastStrokeReward > 20000) {
      lastStrokeReward = Date.now();
      addAffection(2);
    }
    statClicks++;
    playSmooth("touch-head", [
      pickFeedback(
        "head-stroke",
        travel > 25
          ? [
              "头发被揉乱了…不过，我不介意。",
              "呵呵，再轻一点就很好。",
              "摸够了吗？那让我整理一下发饰。",
            ]
          : [
              "你的手好暖。",
              "唔…我差一点睡着了。",
              "这样安静待一会儿，也很好。",
            ],
      ),
    ]);
  },
  cancelHold: () => {
    ipcRenderer.send("stroke-capture", false);
    strokeLease?.finish();
    strokeLease = null;
    isPlayingAction = false;
    restoreBasePose();
  },
});
window.addEventListener("beforeunload", () => interactionFeel.dispose(), {
  once: true,
});
