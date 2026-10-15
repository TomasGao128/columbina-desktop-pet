(() => {
  const { ACTIONS } = require("../core/chat-reaction");
  const canReact = () =>
    !focusMode &&
    !sleeping &&
    !resting &&
    !isPlayingAction &&
    !dragging &&
    !pendingDrag &&
    !menuOpen &&
    !lifeUI?.modalActive &&
    !edgeSide &&
    !walking &&
    !burstActive;
  const onReply = (_event, payload) => {
    const text = typeof payload === "string" ? payload : payload?.text;
    if (typeof text !== "string" || !canReact()) return;
    const action = ACTIONS[payload?.emotion];
    if (action && actionCatalog?.get(action)) {
      companion?.releaseLook();
      isPlayingAction = true;
      const finish = () => {
        isPlayingAction = false;
        restoreBasePose();
      };
      // Direct playback avoids voice, affection rewards and background sharing.
      const frames = actionCatalog.get(action).frames;
      const started = actionPlayer.play(
        reducedMotion ? frames.slice(0, 1) : frames,
        {
          actionId: action,
          automatic: true,
          frameMs: 280,
          holdMs: 2200,
          onDone: finish,
          onError: finish,
        },
      );
      if (!started) finish();
    }
    voiceDirector?.stop();
    showBubble(text, 6000);
  };
  ipcRenderer.on("chat-pet-reply", onReply);
  window.addEventListener(
    "beforeunload",
    () => ipcRenderer.removeListener("chat-pet-reply", onReply),
    { once: true },
  );
})();
