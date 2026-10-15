const query = new URLSearchParams(location.search);
const number = (key) => Number(query.get(key)) || 0;
const id = number('id');
const stage = document.getElementById('stage');
const size = number('size'),
  span = number('span');
const intensity = ['0', '1', '2'].includes(query.get('intensity'))
  ? Number(query.get('intensity'))
  : 2;
const reducedMotion = query.has('reducedMotion')
  ? query.get('reducedMotion') === 'true'
  : matchMedia('(prefers-reduced-motion: reduce)').matches;
stage.dataset.intensity = String(intensity);
stage.dataset.reducedMotion = String(reducedMotion);
for (const [key, value] of Object.entries({
  cx: number('cx'),
  cy: number('cy'),
  size,
  span,
  dx: number('sourceCX') - number('cx'),
  dy: number('sourceCY') - number('cy'),
}))
  stage.style.setProperty('--' + key, value + 'px');
if (reducedMotion)
  for (const key of ['cx', 'cy'])
    stage.style.setProperty('--' + key, number(key === 'cx' ? 'sourceCX' : 'sourceCY') + 'px');
stage.style.setProperty('--opacity', query.get('opacity') || '1');
// Three secondary layers: an inward charge, a celestial seal, and outward stars.
for (const name of ['moonbeam', 'sigils', 'stardust', 'charge-streaks']) {
  const el = document.createElement('div');
  el.id = name;
  stage.appendChild(el);
}
const dust = document.getElementById('stardust'),
  sigils = document.getElementById('sigils'),
  streaks = document.getElementById('charge-streaks');
if (intensity > 0) {
  for (let i = 0; i < 12; i++) {
    const glyph = document.createElement('i'),
      a = (i * Math.PI) / 6;
    glyph.className = 'sigil-sign';
    glyph.textContent = i % 3 === 0 ? '☾' : i % 2 ? '✦' : '◇';
    glyph.style.left = Math.cos(a) * size * 0.79 + 'px';
    glyph.style.top = Math.sin(a) * size * 0.79 - size * 0.2 + 'px';
    sigils.appendChild(glyph);
  }
  if (!reducedMotion) {
    for (let i = 0; i < (intensity === 2 ? 72 : 20); i++) {
      const el = document.createElement('i'),
        a = i * 2.399963,
        r = size * (0.48 + (i % 11) * 0.085);
      el.className = 'burst-star';
      el.textContent = i % 5 ? '' : '✦';
      el.style.setProperty('--sx', Math.cos(a) * r + 'px');
      el.style.setProperty('--sy', Math.sin(a) * r * 0.62 - size * 0.2 + 'px');
      el.style.setProperty('--ex', Math.cos(a) * r * 1.24 + 'px');
      el.style.setProperty('--ey', Math.sin(a) * r * 0.8 - size * 0.45 + 'px');
      el.style.setProperty('--delay', 1.6 + (i % 13) * 0.12 + 's');
      el.style.setProperty('--star-size', (i % 5 === 0 ? 10 : 3 + (i % 3)) + 'px');
      el.style.setProperty(
        '--star-color',
        i % 3 === 0 ? '#ffde92' : i % 3 === 1 ? '#80e2ff' : '#b4a0ff',
      );
      dust.appendChild(el);
    }
    for (let i = 0; i < (intensity === 2 ? 18 : 6); i++) {
      const el = document.createElement('i'),
        a = (i * Math.PI) / 9;
      el.className = 'charge-streak';
      el.style.setProperty('--sx', Math.cos(a) * size * 0.65 + 'px');
      el.style.setProperty('--sy', Math.sin(a) * size * 0.65 - size * 0.18 + 'px');
      el.style.setProperty('--angle', (a * 180) / Math.PI + 90 + 'deg');
      el.style.setProperty('--delay', (i % 6) * 0.09 + 's');
      streaks.appendChild(el);
    }
  }
}
const feathers = document.getElementById('feathers');
for (let i = 0; i < (reducedMotion || intensity === 0 ? 0 : intensity === 1 ? 8 : 36); i++) {
  const side = i % 2 ? 1 : -1,
    t = (i % 18) / 18;
  const el = document.createElement('i');
  el.className = 'feather';
  const vars = {
    w: 3 + (i % 4) + 'px',
    x: side * (size * 0.23 + t * span * 0.35) + 'px',
    y: -size * 0.15 + Math.sin(i * 1.6) * size * 0.28 + 'px',
    tx: side * (40 + t * 120) + 'px',
    ty: -60 - (i % 7) * 16 + 'px',
    angle: side * (20 + t * 65) + 'deg',
    delay: 1.9 + t * 0.9 + 's',
  };
  for (const [key, value] of Object.entries(vars)) el.style.setProperty('--' + key, value);
  feathers.appendChild(el);
}
let audio;
function playMoonTone() {
  if (query.get('sound') !== 'true') return;
  try {
    audio = new AudioContext();
    [261.63, 392, 523.25, 783.99].forEach((hz, i) => {
      const osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      osc.connect(gain);
      gain.connect(audio.destination);
      const t = audio.currentTime + 0.35 + i * 0.22;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.035, t + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      osc.start(t);
      osc.stop(t + 2.7);
    });
    setTimeout(() => audio.close().catch(() => {}), 4200);
  } catch (_e) {}
}
const actor = document.getElementById('actor'),
  previous = document.getElementById('actorPrevious');
const poses = {
  stand: './burst-canonical.png',
  charge: './burst-charge.png',
  release: './burst-release.png',
};
const poseImages = Object.values(poses).map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});
let animationFrame = 0,
  disposed = false,
  currentPose = 'stand';
window.__burstPoseHistory = [];
function changePose(pose, elapsed) {
  if (pose === currentPose) return;
  previous.getAnimations().forEach((a) => a.cancel());
  actor.getAnimations().forEach((a) => a.cancel());
  previous.src = actor.src;
  actor.src = poses[pose];
  currentPose = pose;
  stage.dataset.pose = pose;
  // Short aligned dissolves soften key-pose cuts; no synthetic intermediate frames.
  previous.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
  actor.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, fill: 'forwards' });
  window.__burstPoseHistory.push({ pose, elapsed });
}
window.addEventListener('beforeunload', () => {
  disposed = true;
  cancelAnimationFrame(animationFrame);
  if (audio && audio.state !== 'closed') audio.close().catch(() => {});
});
Promise.all([...Array.from(document.images), ...poseImages].map((image) => image.decode()))
  .then(() => {
    if (disposed) return;
    window.__burstReady = true;
    stage.classList.add('casting');
    playMoonTone();
    window.moonBurst.ready(id);
    window.__burstStartedAt = performance.now();
    stage.dataset.pose = 'stand';
    function tick(now) {
      if (disposed) return;
      const elapsed = now - window.__burstStartedAt;
      stage.dataset.phase =
        elapsed < 1200
          ? 'charge'
          : elapsed < 2600
            ? 'unfurl'
            : elapsed < 4700
              ? 'release'
              : elapsed < 6500
                ? 'feathers'
                : 'return';
      changePose(
        elapsed < 250
          ? 'stand'
          : elapsed < 1450
            ? 'charge'
            : elapsed < 5450
              ? 'release'
              : elapsed < 6500
                ? 'charge'
                : 'stand',
        elapsed,
      );
      if (elapsed < 7800) animationFrame = requestAnimationFrame(tick);
    }
    animationFrame = requestAnimationFrame(tick);
  })
  .catch(() => window.moonBurst.failed(id));
