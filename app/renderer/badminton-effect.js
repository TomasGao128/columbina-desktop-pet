// Continuous quadratic arcs; cork points along actual velocity, feather fan trails behind.
function installBadmintonEffect(layer) {
  let shuttle = null,
    raf = null,
    flash = null,
    ring = null,
    trails = [],
    history = [],
    segment = null,
    current = { x: 0.1, y: 0.2 },
    angle = -70,
    disposed = false;
  const contacts = [
    { x: 0.83, y: 0.27 },
    { x: 0.82, y: 0.65 },
    { x: 0.92, y: 0.075 },
    { x: 0.15, y: 0.32 },
    { x: 0.85, y: 0.25 },
    { x: 0.63, y: 0.48 },
    { x: 0.28, y: 0.64 },
    { x: 0.32, y: 0.42 },
  ];
  const svg =
    '<svg viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg"><path d="M16 36 4 7Q7 1 11 7L19 32 15 4Q20-1 24 4L22 32 29 7Q33 1 36 7L25 36Z" fill="#fffdfb" stroke="#a69ebc" stroke-width="1"/><path d="m8 9 12 26M20 6v29M32 9 21 35M10 17h20M13 25h14" fill="none" stroke="#c8c3d4" stroke-width=".8"/><path d="M16 35h9v6q-4 7-9 0Z" fill="#eee0ce" stroke="#a89dae"/><path d="M16 35h9v3h-9Z" fill="#b7a4cf"/></svg>';
  const bez = (a, c, b, t) => ({
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
  });
  function clear() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    flash?.cancel();
    flash = null;
    ring?.remove();
    ring = null;
    shuttle?.remove();
    shuttle = null;
    trails.forEach((e) => e.remove());
    trails = [];
    history = [];
    segment = null;
    current = { x: 0.1, y: 0.2 };
    angle = -70;
  }
  function spark(hit) {
    ring?.remove();
    flash?.cancel();
    ring = document.createElement('span');
    ring.className = 'badminton-hit';
    ring.style.left = hit.x * 100 + '%';
    ring.style.top = hit.y * 100 + '%';
    layer.appendChild(ring);
    flash = ring.animate(
      [
        { opacity: 1, transform: 'translate(-50%,-50%) scale(.2)' },
        { opacity: 0.95, transform: 'translate(-50%,-50%) scale(.75)', offset: 0.28 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(1.3)' },
      ],
      { duration: 380, fill: 'forwards' },
    );
  }
  function tick(now) {
    if (disposed || !segment || !shuttle) return;
    const s = segment,
      t = Math.min(1, Math.max(0, (now - s.start) / s.duration)),
      old = current;
    if (s.strike) {
      if (t < 0.44) current = bez(s.from, s.inControl, s.hit, t / 0.44);
      else {
        current = bez(s.hit, s.outControl, s.end, (t - 0.44) / 0.56);
        if (!s.flashed) {
          s.flashed = true;
          spark(s.hit);
        }
      }
    } else current = bez(s.from, s.inControl, s.end, t);
    const dx = current.x - old.x,
      dy = current.y - old.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.0001) {
      const desired = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
      angle += (((desired - angle + 540) % 360) - 180) * 0.25;
    }
    const rect = layer.getBoundingClientRect();
    shuttle.style.transform = `translate(${current.x * rect.width}px,${current.y * rect.height}px) translate(-50%,-50%) rotate(${angle}deg)`;
    shuttle.style.opacity = s.index === 7 ? String(1 - t) : '1';
    history.unshift({ ...current });
    if (history.length > 24) history.pop();
    trails.forEach((el, i) => {
      const p = history[(i + 1) * 2] || current;
      el.style.transform = `translate(${p.x * rect.width}px,${p.y * rect.height}px) scale(${1 - i * 0.09})`;
      el.style.opacity = String((0.78 - i * 0.085) * (s.index === 7 ? 1 - t : 1));
    });
    if (t < 1) raf = requestAnimationFrame(tick);
    else {
      raf = null;
      shuttle.dataset.flight = 'settled';
    }
  }
  function cue(index, duration = 600) {
    if (disposed) return;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    if (!shuttle) {
      shuttle = document.createElement('span');
      shuttle.className = 'badminton-shuttle';
      shuttle.innerHTML = svg;
      layer.appendChild(shuttle);
      for (let i = 0; i < 8; i++) {
        const e = document.createElement('span');
        e.className = 'badminton-trail';
        layer.appendChild(e);
        trails.push(e);
      }
    }
    const hit = contacts[index % 8],
      strike = index < 5,
      end = strike
        ? { x: hit.x > 0.5 ? 0.13 : 0.87, y: Math.max(0.1, hit.y - 0.22) }
        : { x: 0.55, y: index === 5 ? 0.57 : 0.87 };
    segment = {
      index,
      strike,
      from: { ...current },
      hit,
      end,
      inControl: {
        x: (current.x + (strike ? hit.x : end.x)) / 2,
        y: Math.max(0.035, Math.min(current.y, strike ? hit.y : end.y) - 0.11),
      },
      outControl: { x: (hit.x + end.x) / 2, y: Math.max(0.035, Math.min(hit.y, end.y) - 0.15) },
      start: performance.now(),
      duration,
      flashed: false,
    };
    shuttle.dataset.flight = 'active';
    raf = requestAnimationFrame(tick);
  }
  return {
    cue,
    clear,
    dispose() {
      clear();
      disposed = true;
    },
  };
}
if (typeof module !== 'undefined') module.exports = { installBadmintonEffect };
