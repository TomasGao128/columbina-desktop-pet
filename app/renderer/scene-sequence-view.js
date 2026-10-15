// Each draw uses entire authored character/chair sprites, with no calf/body layers.
let nextSequenceId = 0;
function createSceneSequence({ canvas, config, images }) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const id = ++nextSequenceId;
  let revision = "",
    frame = "";
  function draw(state, w, h, dpr = 1, opacity = 1) {
    const pw = Math.round(w * dpr),
      ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      revision = "";
    }
    canvas.style.opacity = opacity;
    const clip = config.clips[state.pose] || config.clips.idle;
    const { index } = state.frame;
    const nextRevision = `${id}:${state.pose}:${index}`;
    if (revision === nextRevision) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frame = clip[index];
    const a = images[frame];
    if (a?.complete) {
      ctx.drawImage(a, 0, 0, w, h);
    }
    revision = nextRevision;
  }
  return {
    draw,
    get frame() {
      return frame;
    },
    get source() {
      return { node: canvas, revision };
    },
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      revision = "";
    },
  };
}
module.exports = { createSceneSequence };
