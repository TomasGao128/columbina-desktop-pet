// Separate ownership for drag poses, idle gaze and interaction props. No blended sprites.
function installCompanion({
  image,
  container,
  loadFrames,
  manifest,
  state,
  restore,
  sound,
  tracking = true,
  badmintonFactory = null,
}) {
  const layer = document.createElement("div");
  layer.className = "companion-props";
  container.appendChild(layer);
  const badminton = badmintonFactory
    ? badmintonFactory(layer)
    : { cue() {}, clear() {} };
  const gaze = manifest.gaze;
  const size = gaze.gridSize || 5,
    center = Math.floor(size / 2),
    centerIndex = gaze.centerIndex ?? 0;
  const ring = [
    "right",
    "downRight",
    "down",
    "downLeft",
    "left",
    "upLeft",
    "up",
    "upRight",
  ];
  let dragTimer = null,
    dragToken = 0,
    dragIndex = 0,
    direction = 0,
    lastPoint = null,
    gazeActive = false,
    blockedUntil = 0;
  let cursor = null,
    lookIndex = centerIndex,
    audioContext = null,
    notes = [],
    gazeReady = false,
    lookX = center,
    lookY = center,
    lastTime = 0,
    lastPoseAt = 0,
    gazeRaf = null;
  const lookHistory = [];
  let dropAnimation = null,
    lastMoveAt = 0,
    drawDirection = 0,
    dragDraw = null,
    dragIdleTimer = null;
  let poseSector = -1,
    poseChangedAt = 0,
    disposed = false;
  let gazeRetryTimer = null,
    gazeLoadAttempts = 0,
    gazeLoadError = null,
    gazeLoading = null,
    dragLoading = null;
  function boundedLoad(frames) {
    const controller = new AbortController();
    let timer, rejectPending;
    const deadline = new Promise((_, reject) => {
      rejectPending = reject;
      timer = setTimeout(
        () => reject(new Error("Companion loading timed out")),
        5000,
      );
    });
    let loading;
    try {
      loading = loadFrames(frames, { signal: controller.signal });
    } catch (error) {
      loading = Promise.reject(error);
    }
    const promise = Promise.race([Promise.resolve(loading), deadline])
      .catch((error) => {
        controller.abort();
        throw error;
      })
      .finally(() => clearTimeout(timer));
    return {
      promise,
      cancel() {
        controller.abort();
        clearTimeout(timer);
        rejectPending(new Error("Companion loading canceled"));
      },
    };
  }
  function prepareGaze() {
    if (disposed || gazeLoading) return;
    gazeLoadAttempts++;
    const loading = boundedLoad(gaze.frames);
    gazeLoading = loading;
    loading.promise
      .then(() => {
        if (gazeLoading !== loading) return;
        gazeLoading = null;
        if (disposed) return;
        gazeReady = true;
        gazeLoadError = null;
        if (tracking && state().canLook) restore();
      })
      .catch((error) => {
        if (gazeLoading !== loading) return;
        gazeLoading = null;
        if (disposed) return;
        gazeLoadError = String(error?.message || error);
        // Two delayed retries recover transient reads without polling missing assets forever.
        if (gazeLoadAttempts < 3)
          gazeRetryTimer = setTimeout(() => {
            gazeRetryTimer = null;
            prepareGaze();
          }, gazeLoadAttempts * 1000);
      });
  }
  prepareGaze();
  function cancelDrop() {
    const previous = dropAnimation;
    dropAnimation = null;
    if (previous) {
      previous.onfinish = previous.oncancel = null;
      previous.cancel();
    }
    layer.querySelectorAll(".drop-glow").forEach((el) => el.remove());
  }
  const releaseLook = () => {
    cancelDrop();
    gazeActive = false;
    blockedUntil = 0;
    lookX = center;
    lookY = center;
    lookIndex = centerIndex;
    poseSector = -1;
    lastTime = 0;
    lastPoseAt = 0;
    image.style.translate = "";
    image.style.rotate = "";
  };
  function resumeIdle() {
    if (disposed || !tracking || !gazeReady || !state().canLook) return;
    gazeActive = true;
    image.src = gaze.frames[centerIndex];
    lookIndex = centerIndex;
    poseSector = -1;
    poseChangedAt = performance.now();
  }
  const stopEffects = () => {
    badminton.clear();
    layer.replaceChildren();
    for (const n of notes)
      try {
        n.stop();
      } catch {}
    notes = [];
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  };
  const stopDrag = () => {
    dragToken++;
    dragLoading?.cancel();
    dragLoading = null;
    clearTimeout(dragIdleTimer);
    dragIdleTimer = null;
    clearInterval(dragTimer);
    dragTimer = null;
    dragDraw = null;
    lastPoint = null;
    releaseLook();
  };
  function restartDragClock() {
    dragDraw();
    clearInterval(dragTimer);
    dragTimer = setInterval(dragDraw, manifest.drag.frameMs || 180);
  }
  function armDragIdle() {
    clearTimeout(dragIdleTimer);
    dragIdleTimer = null;
    if (!dragDraw || direction === 0) return;
    const token = dragToken;
    dragIdleTimer = setTimeout(
      () => {
        dragIdleTimer = null;
        if (token !== dragToken || !dragDraw) return;
        if (!state().dragging) {
          stopDrag();
          return;
        }
        direction = 0;
        restartDragClock();
      },
      Math.max(
        0,
        (manifest.drag.idleReturnMs || 320) - (performance.now() - lastMoveAt),
      ),
    );
  }
  function startDrag(point) {
    if (
      disposed ||
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    )
      return;
    stopDrag();
    lastPoint = { x: point.x, y: point.y };
    direction = 0;
    drawDirection = 0;
    dragIndex = 0;
    lastMoveAt = performance.now();
    const token = dragToken;
    const loading = boundedLoad(manifest.drag.frames);
    dragLoading = loading;
    loading.promise
      .then(() => {
        if (dragLoading === loading) dragLoading = null;
        if (token !== dragToken || !state().dragging) return;
        const draw = () => {
          if (!state().dragging) {
            stopDrag();
            return;
          }
          if (
            performance.now() - lastMoveAt >
            (manifest.drag.idleReturnMs || 320)
          )
            direction = 0;
          if (direction !== drawDirection) {
            drawDirection = direction;
            dragIndex = 0;
          }
          const base = direction < 0 ? 3 : direction > 0 ? 6 : 0;
          const phase =
            direction === 0
              ? [0, 1, 2, 1][dragIndex++ % 4]
              : Math.min(dragIndex++, 2);
          if (state().edgePreview)
            image.src =
              require("../core/edge-peek").EDGE_PEEKS[
                state().edgePreview
              ].frame;
          else image.src = manifest.drag.frames[base + phase];
        };
        dragDraw = draw;
        restartDragClock();
        armDragIdle();
      })
      .catch(() => {
        if (token === dragToken) stopDrag();
      });
  }
  function moveDrag(point) {
    if (
      disposed ||
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    )
      return;
    const previous = direction;
    if (lastPoint) {
      const dx = point.x - lastPoint.x;
      if (dx < -2) direction = -1;
      else if (dx > 2) direction = 1;
      // Tiny pointer jitter must not erase a lean; the idle timer returns to floating.
      // Accumulate slow movement from the last accepted sample; bounded jitter stays neutral.
      if (Math.abs(dx) > 2) {
        lastMoveAt = performance.now();
        lastPoint = { x: point.x, y: point.y };
        armDragIdle();
      }
    }
    // Start the new lean now, then give its first original frame a full interval.
    if (direction !== previous && dragDraw && state().dragging)
      restartDragClock();
  }
  function settleDrop() {
    cancelDrop();
    const current = state();
    if (
      disposed ||
      current.dragging ||
      current.edgeDocked ||
      current.reducedMotion ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof image.animate !== "function"
    )
      return;
    // Translate the complete sprite: preserve proportions and the existing alpha mask.
    // Offset begins and ends at zero so releasing never teleports the character.
    const animation = image.animate(
      [
        { translate: "0px 0px", offset: 0 },
        { translate: "0px 4px", offset: 0.24 },
        { translate: "0px -2px", offset: 0.58 },
        { translate: "0px 0px", offset: 1 },
      ],
      { duration: manifest.drag.dropMs || 420, easing: "ease-in-out" },
    );
    dropAnimation = animation;
    const glow = document.createElement("span");
    glow.className = "drop-glow";
    glow.setAttribute("aria-hidden", "true");
    layer.append(glow);
    animation.onfinish = animation.oncancel = () => {
      if (dropAnimation === animation) dropAnimation = null;
      glow.remove();
    };
  }
  function updateLook(point) {
    if (
      disposed ||
      !gazeReady ||
      dropAnimation !== null ||
      !tracking ||
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Date.now() < blockedUntil
    )
      return;
    const s = state();
    if (!s.canLook) return;
    const r = image.getBoundingClientRect();
    if (
      !Number.isFinite(r.left) ||
      !Number.isFinite(r.top) ||
      !Number.isFinite(r.width) ||
      !Number.isFinite(r.height) ||
      r.width <= 0 ||
      r.height <= 0
    )
      return;
    const dx = (point.x - r.left - r.width * 0.5) / r.width,
      dy = (point.y - r.top - r.height * 0.2) / r.height;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const now = performance.now(),
      dt = Math.min(64, lastTime ? now - lastTime : 16);
    lastTime = now;
    // Preserve the bearing of distant cursors. Clamping axes separately would
    // turn almost every far-away mouse position into a diagonal look.
    // Scale both axes together before weighting, so even huge finite samples
    // preserve their bearing without overflowing the easing state.
    const scale = Math.max(1, Math.abs(dx), Math.abs(dy));
    const rawX = dx / scale / 0.65,
      rawY = dy / scale / 0.4,
      extent = Math.max(1 / scale, Math.hypot(rawX, rawY));
    const targetX = center + (rawX / extent) * center,
      targetY = center + (rawY / extent) * center;
    const speed = Math.max(0.5, Math.min(2, s.gazeSpeed || 1));
    const stepMs = Math.max(35, (gaze.stepMs || 70) / speed);
    const ease = 1 - Math.exp(-dt / ((gaze.easeMs || 95) / speed));
    lookX += (targetX - lookX) * ease;
    lookY += (targetY - lookY) * ease;
    if (!gazeActive) resumeIdle();
    const x = (lookX - center) / center,
      y = (lookY - center) / center,
      radius = Math.hypot(x, y);
    let wanted =
      radius < (poseSector < 0 ? 0.16 : 0.1)
        ? -1
        : (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
    let changed = false;
    // A small angular deadband prevents flickering along sector boundaries.
    if (poseSector >= 0 && wanted >= 0) {
      const angle = Math.atan2(y, x),
        base = (poseSector * Math.PI) / 4;
      const delta = Math.atan2(Math.sin(angle - base), Math.cos(angle - base));
      if (Math.abs(delta) < Math.PI / 7.5) wanted = poseSector;
    }
    if (wanted !== poseSector && now - lastPoseAt >= stepMs) {
      if (wanted >= 0 && poseSector >= 0) {
        const delta = ((wanted - poseSector + 12) % 8) - 4;
        // Opposite looks pass through the front; nearby looks use adjacent poses.
        wanted =
          Math.abs(delta) >= 3 ? -1 : (poseSector + Math.sign(delta) + 8) % 8;
      }
      poseSector = wanted;
      poseChangedAt = now;
      changed = true;
    }
    let next = centerIndex;
    if (poseSector >= 0) {
      const pair = gaze.directions?.[ring[poseSector]];
      if (pair)
        next =
          pair[now - poseChangedAt >= (gaze.settleMs || 140) / speed ? 1 : 0];
    } else {
      const variants = gaze.centerVariants || {};
      next =
        x > 0.07
          ? (variants.right ?? centerIndex)
          : x < -0.07
            ? (variants.left ?? centerIndex)
            : y < -0.07
              ? (variants.up ?? centerIndex)
              : centerIndex;
    }
    if (next !== lookIndex && (changed || now - lastPoseAt >= stepMs)) {
      lookIndex = next;
      image.src = gaze.frames[next];
      lastPoseAt = now;
      lookHistory.push(next);
      if (lookHistory.length > 80) lookHistory.shift();
    }
  }
  const tick = () => {
    if (disposed) return;
    if (dropAnimation && state().reducedMotion) cancelDrop();
    if (gazeActive && !state().canLook) releaseLook();
    updateLook(cursor);
    gazeRaf = requestAnimationFrame(tick);
  };
  gazeRaf = requestAnimationFrame(tick);
  function setTracking(on) {
    if (disposed) return;
    const changed = tracking !== !!on;
    tracking = !!on;
    if (!tracking) {
      cursor = null;
      if (gazeActive) {
        releaseLook();
        restore();
      }
    } else if (changed && tracking) {
      if (!gazeReady && !gazeLoading) {
        clearTimeout(gazeRetryTimer);
        gazeRetryTimer = null;
        gazeLoadAttempts = 0;
        gazeLoadError = null;
        prepareGaze();
      }
      resumeIdle();
    }
  }
  function music() {
    if (disposed || !sound() || audioContext) return;
    try {
      audioContext = new AudioContext();
      audioContext.resume().catch(() => {});
      [
        523.25, 587.33, 659.25, 587.33, 523.25, 493.88, 523.25, 587.33, 523.25,
        493.88,
      ].forEach((freq, i) => {
        const osc = audioContext.createOscillator(),
          gain = audioContext.createGain(),
          t = audioContext.currentTime + i * 0.44;
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.025, t + 0.09);
        gain.gain.linearRampToValueAtTime(0, t + 0.42);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(t);
        osc.stop(t + 0.43);
        notes.push(osc);
      });
    } catch {
      stopEffects();
    }
  }
  function showEffect(key, index) {
    if (disposed) return;
    layer.style.opacity = image.style.opacity || "1";
    if (key.startsWith("pose-")) {
      layer.replaceChildren();
      const prop = document.createElement("span");
      prop.className = "pose-aura " + key;
      prop.textContent =
        key === "pose-notes" ? "♪  ♫" : key === "pose-feather" ? "✧  ✧" : "";
      layer.appendChild(prop);
      return;
    }
    if (key === "badminton") {
      badminton.cue(index, manifest.badminton.frameDurations[index]);
      return;
    }
    if (key === "cake" && manifest.cake.embeddedProps) {
      layer.replaceChildren();
      return;
    }
    layer.replaceChildren();
    const el = document.createElement("span");
    el.className = "companion-prop";
    if (key === "cake" && index >= 2 && index <= 6) {
      el.textContent = "🍰";
      el.style.left = "52%";
      el.style.top = index < 4 ? "52%" : "27%";
    } else if (key === "ball" && index <= 4) {
      el.classList.add("soft-ball");
      el.style.left = [8, 22, 36, 44, 24][index] + "%";
      el.style.top = [34, 24, 18, 21, 40][index] + "%";
    } else if (key === "sing" && index >= 2 && index <= 6) {
      el.textContent = index % 2 ? "♪" : "♫";
      el.classList.add("song-note");
      el.style.left = "68%";
      el.style.top = 30 - index * 2 + "%";
      if (index === 2) music();
    } else if (key === "pinch" && index >= 2 && index <= 5) {
      el.textContent = "♡";
      el.style.left = "62%";
      el.style.top = "20%";
    } else if (key === "feather" && index >= 1 && index <= 6) {
      el.textContent = "🪶";
      el.style.left = (index < 4 ? 57 : 53) + "%";
      el.style.top = [0, 8, 20, 32, 39, 46, 50][index] + "%";
    } else if (key === "shoulder" && index >= 2 && index <= 5) {
      el.classList.add("shoulder-ring");
      el.style.left = "63%";
      el.style.top = "33%";
    } else return;
    layer.appendChild(el);
  }
  return {
    startDrag,
    moveDrag,
    stopDrag,
    settleDrop,
    cancelDrop,
    releaseLook,
    resumeIdle,
    showEffect,
    stopEffects,
    setTracking,
    updateLook,
    setCursor: (p) => {
      if (disposed) return;
      if (p == null) cursor = null;
      else if (Number.isFinite(p.x) && Number.isFinite(p.y))
        cursor = { x: p.x, y: p.y };
    },
    get gazeActive() {
      return gazeActive;
    },
    get idleFrame() {
      return tracking && gazeReady ? manifest.gaze.frames[0] : "./frame-1.webp";
    },
    get status() {
      return {
        dragActive: dragTimer !== null,
        dropActive: dropAnimation !== null,
        direction,
        lookIndex,
        gazeActive,
        tracking,
        effects: layer.childElementCount,
        audio: audioContext !== null,
        gazeReady,
        gazeLoadAttempts,
        gazeLoadError,
        lookX,
        lookY,
        lookHistory: [...lookHistory],
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(gazeRetryTimer);
      gazeRetryTimer = null;
      gazeLoading?.cancel();
      gazeLoading = null;
      stopDrag();
      cancelDrop();
      cancelAnimationFrame(gazeRaf);
      stopEffects();
      layer.remove();
    },
  };
}
if (typeof module !== "undefined") module.exports = { installCompanion };
