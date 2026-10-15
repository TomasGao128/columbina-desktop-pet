function installInteractionFeel({
  container,
  image,
  head,
  allowed,
  reduced,
  beginHold,
  endHold,
  cancelHold,
  edgeSide,
  edgeFrame,
  ipc,
  tuning = () => ({ dragAmount: 1, peekAmount: 1 }),
}) {
  const { dragTilt } = require("../core/interaction-feel");
  const layer = document.createElement("div");
  layer.className = "touch-feel-layer";
  layer.setAttribute("aria-hidden", "true");
  container.append(layer);
  let press = null,
    timer = null,
    holding = false,
    dragPoint = null,
    settleTimer = null,
    preview = null,
    tilt = 0;
  function clearPress() {
    clearTimeout(timer);
    timer = null;
    const old = press;
    press = null;
    holding = false;
    layer.replaceChildren();
    if (old && head.hasPointerCapture(old.id))
      head.releasePointerCapture(old.id);
  }
  function down(e) {
    if (e.button !== 0 || e.target !== head || !allowed()) return;
    clearPress();
    press = {
      id: e.pointerId,
      x: e.screenX,
      y: e.screenY,
      lastX: e.screenX,
      travel: 0,
    };
    timer = setTimeout(() => {
      if (!press || !allowed()) {
        clearPress();
        return;
      }
      if (!beginHold()) {
        clearPress();
        return;
      }
      holding = true;
      layer.dataset.kind = "stroke";
      try {
        head.setPointerCapture(press.id);
      } catch {}
      for (let i = 0; i < 5; i++) {
        const dot = document.createElement("span");
        dot.className = "touch-feel-spark";
        dot.style.setProperty("--i", i);
        layer.append(dot);
      }
      layer.classList.toggle("reduced", reduced());
    }, 550);
  }
  function move(e) {
    if (!press || e.pointerId !== press.id) return;
    if (!holding) {
      if (Math.hypot(e.screenX - press.x, e.screenY - press.y) > 4)
        clearPress();
      return;
    }
    e.stopImmediatePropagation();
    if (!allowed(true)) {
      cancel();
      return;
    }
    press.travel += Math.min(40, Math.abs(e.screenX - press.lastX));
    press.lastX = e.screenX;
    layer.style.setProperty("--stroke", Math.min(1, press.travel / 80));
  }
  function up(e) {
    if (!press || e.pointerId !== press.id) return;
    const wasHolding = holding,
      travel = press.travel;
    clearPress();
    if (wasHolding) {
      e.stopImmediatePropagation();
      if (e.type === "pointerup") endHold(travel);
      else cancelHold();
    }
  }
  function cancel() {
    const was = holding;
    clearPress();
    if (was) cancelHold();
    clearTimeout(settleTimer);
    settleTimer = null;
    dragPoint = null;
    tilt = 0;
    image.style.rotate = "";
    image.style.translate = "";
    image.classList.remove("feel-drag", "feel-edge");
    preview = null;
  }
  function dragMove(point) {
    clearPress();
    const now = performance.now();
    if (dragPoint && !reduced())
      tilt =
        dragTilt(point.x - dragPoint.x, now - dragPoint.at) *
        tuning().dragAmount;
    dragPoint = { x: point.x, at: now };
    image.classList.add("feel-drag");
    image.style.rotate = tilt + "deg";
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      tilt = 0;
      image.style.rotate = "0deg";
    }, 160);
  }
  function drop(cancelled = false) {
    dragPoint = null;
    clearTimeout(settleTimer);
    settleTimer = null;
    tilt = 0;
    image.style.rotate = "0deg";
    if (cancelled || reduced()) {
      image.style.rotate = "";
      image.classList.remove("feel-drag");
    } else
      settleTimer = setTimeout(() => {
        image.style.rotate = "";
        image.classList.remove("feel-drag");
        settleTimer = null;
      }, 260);
    preview = null;
  }
  const onPreview = (_e, value) => {
    if (!dragPoint) return;
    preview = value?.progress > 0.25 ? value?.side || null : null;
    if (preview && value.progress > 0.25) image.src = edgeFrame(preview);
  };
  const onCursor = (_e, p) => {
    const side = edgeSide();
    if (!side || !p || !allowed(true) || reduced()) {
      image.style.translate = "";
      image.classList.remove("feel-edge");
      return;
    }
    const rect = image.getBoundingClientRect();
    const near =
      Math.hypot(
        p.x -
          (side === "left"
            ? Math.max(0, rect.right - rect.width * 0.2)
            : rect.left + rect.width * 0.2),
        p.y - (rect.top + rect.height * 0.23),
      ) < 110;
    image.classList.add("feel-edge");
    image.style.translate =
      (near ? (side === "left" ? 16 : -20) * tuning().peekAmount : 0) +
      "px 0px";
  };
  container.addEventListener("pointerdown", down, true);
  container.addEventListener("pointermove", move, true);
  container.addEventListener("pointerup", up, true);
  container.addEventListener("pointercancel", up, true);
  container.addEventListener("lostpointercapture", up, true);
  const blur = () => cancel();
  window.addEventListener("blur", blur);
  ipc.on("pet-edge-preview", onPreview);
  ipc.on("companion-cursor", onCursor);
  return {
    cancel,
    dragMove,
    drop,
    get holding() {
      return holding;
    },
    get status() {
      return { holding, tilt, preview, sparks: layer.childElementCount };
    },
    dispose() {
      cancel();
      layer.remove();
      container.removeEventListener("pointerdown", down, true);
      container.removeEventListener("pointermove", move, true);
      container.removeEventListener("pointerup", up, true);
      container.removeEventListener("pointercancel", up, true);
      container.removeEventListener("lostpointercapture", up, true);
      window.removeEventListener("blur", blur);
      ipc.removeListener("pet-edge-preview", onPreview);
      ipc.removeListener("companion-cursor", onCursor);
    },
  };
}
module.exports = { installInteractionFeel };
