// Only current decoded sprite pixels own input; visual overlays never expand the hit area.
function installBodyHit({
  image,
  container,
  ipc,
  protectedState,
  channel = "pet-body-mask",
  sample = () => null,
}) {
  const { bodyHit } = require("../core/body-hit");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  let mask = null,
    last = "",
    disposed = false;
  function refresh() {
    if (disposed) return;
    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    const transform = new DOMMatrixReadOnly(
      style.transform === "none" ? undefined : style.transform,
    );
    const angle =
      Math.atan2(transform.b, transform.a) +
      ((parseFloat(style.rotate) || 0) * Math.PI) / 180;
    const alternative = sample(),
      node = alternative?.node || image;
    const sourceKey = alternative
      ? "composite:" +
        alternative.revision +
        ":" +
        node.width +
        ":" +
        node.height
      : image.currentSrc;
    const ready =
      rect.width > 0 &&
      rect.height > 0 &&
      (alternative
        ? node.width > 0 && node.height > 0
        : image.complete && image.naturalWidth > 0);
    let pixels = ready ? cache.get(sourceKey) : null;
    if (!pixels && ready) {
      ctx.clearRect(0, 0, 128, 128);
      ctx.drawImage(node, 0, 0, 128, 128);
      const rgba = ctx.getImageData(0, 0, 128, 128).data;
      pixels = Array.from({ length: 128 * 128 }, (_, i) => rgba[i * 4 + 3]);
      cache.set(sourceKey, pixels);
      if (cache.size > 8) cache.delete(cache.keys().next().value);
    }
    mask =
      pixels && ready
        ? {
            size: 128,
            pixels,
            cx: rect.x + rect.width / 2,
            cy: rect.y + rect.height / 2,
            width: image.offsetWidth * Math.hypot(transform.a, transform.b),
            height: image.offsetHeight * Math.hypot(transform.c, transform.d),
            angle,
          }
        : null;
    const key = JSON.stringify([
      sourceKey,
      container.dataset.edge,
      mask?.cx,
      mask?.cy,
      mask?.width,
      mask?.height,
      angle,
      !!mask,
    ]);
    if (key !== last) {
      last = key;
      ipc.send(channel, mask);
    }
  }
  function guard(event) {
    if (protectedState() || (event.detail === 0 && event.type === "click"))
      return;
    refresh();
    if (!bodyHit(mask, event.clientX, event.clientY)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  for (const type of ["pointerdown", "click", "contextmenu"])
    container.addEventListener(type, guard, true);
  const timer = setInterval(refresh, 33);
  image.addEventListener("load", refresh);
  refresh();
  return {
    hit(x, y) {
      refresh();
      return bodyHit(mask, x, y);
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
      image.removeEventListener("load", refresh);
      for (const type of ["pointerdown", "click", "contextmenu"])
        container.removeEventListener(type, guard, true);
      cache.clear();
      ipc.send(channel, null);
    },
  };
}
module.exports = { installBodyHit };
