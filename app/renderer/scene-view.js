// Scenic plates are authored raster illustrations; moving light, water and petals are overlays.
function drawScene(ctx, s, w, h, reduced = false, resources = {}, cfg = {}) {
  const theme = s.kind === "cat" ? "garden" : s.theme,
    plate = resources[cfg.environments?.[theme]];
  ctx.save();
  if (plate?.complete)
    ctx.drawImage(plate, -w * 0.02, -h * 0.045, w * 1.67, h * 1.08);
  const t = reduced ? 0 : s.elapsed / 1000;
  if (theme === "lake") {
    ctx.strokeStyle = "#ffdfb345";
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const a = 0.88 + i * 0.058,
        y = 0.65 + i * 0.018,
        wave = reduced ? 0 : Math.sin(t * 0.75 + i) * 0.011;
      ctx.beginPath();
      ctx.ellipse(
        w * (1.09 + wave),
        h * y,
        w * (0.035 + i * 0.009),
        h * 0.003,
        0,
        0,
        Math.PI,
      );
      ctx.stroke();
    }
  } else if (theme === "stars") {
    const count = reduced ? 12 : 48;
    for (let i = 0; i < count; i++) {
      const x = 0.07 + ((i * 0.193) % 1.43),
        y = 0.06 + ((i * 0.137) % 0.48),
        pulse = reduced ? 0.6 : 0.42 + 0.28 * Math.sin(t * 0.7 + i * 1.51);
      ctx.fillStyle = `rgba(255,239,206,${pulse})`;
      ctx.beginPath();
      ctx.arc(
        x * w,
        y * h,
        w * (i % 6 === 0 ? 0.0048 : 0.0023),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    if (!reduced) {
      const a = t % 16;
      if (a > 9 && a < 10.1) {
        const f = (a - 9) / 1.1,
          x = w * (1.38 - f * 0.5),
          y = h * (0.12 + f * 0.18);
        ctx.strokeStyle = `rgba(238,231,255,${Math.sin(f * Math.PI) * 0.7})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w * 0.12, y - h * 0.04);
        ctx.stroke();
      }
    }
  } else {
    for (let i = 0; i < (reduced ? 6 : 26); i++) {
      const speed = 0.022 + (i % 5) * 0.004,
        p = reduced ? (i * 0.139) % 1 : (t * speed + i * 0.139) % 1,
        x = 0.06 + ((i * 0.177) % 1.4) + Math.sin(t * 0.6 + i) * 0.04,
        y = 0.03 + p * 0.9;
      ctx.save();
      ctx.translate(x * w, y * h);
      ctx.rotate(reduced ? 0.4 : t * 0.5 + i);
      ctx.fillStyle = "#f6c2ddbb";
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.007, w * 0.003, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  if (
    s.kind === "cat" &&
    !s.embedded &&
    s.phase === "reacting" &&
    s.action === "lure"
  ) {
    const wave = reduced ? 0 : Math.sin(t * 3) * 0.025;
    ctx.strokeStyle = "#dbc5b5c0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.79, h * 0.39);
    ctx.quadraticCurveTo(w * 0.99, h * 0.5, w * (1.01 + wave), h * 0.69);
    ctx.stroke();
    ctx.fillStyle = "#e5d5f9";
    ctx.beginPath();
    ctx.ellipse(
      w * (1.01 + wave),
      h * 0.72,
      w * 0.012,
      h * 0.035,
      0.6,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  if (s.hearts) {
    const count = reduced ? 2 : 8;
    ctx.font = `${Math.max(12, w * 0.04)}px Georgia`;
    ctx.fillStyle = "#ffd4e6";
    for (let i = 0; i < count; i++) {
      const p = reduced ? 0.3 : (s.age / 3000 + i * 0.15) % 1;
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.fillText("♥", w * (0.32 + i * 0.085), h * (0.6 - p * 0.24));
    }
    ctx.globalAlpha = 1;
  }
  if (s.breeze && !reduced) {
    ctx.strokeStyle = "#e6deee3f";
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.2 + i * 0.26) % 1;
      ctx.beginPath();
      ctx.moveTo(w * (p * 0.7), h * (0.34 + i * 0.16));
      ctx.bezierCurveTo(
        w * (0.3 + p * 0.7),
        h * (0.29 + i * 0.16),
        w * (0.55 + p * 0.7),
        h * (0.43 + i * 0.16),
        w * (0.9 + p * 0.7),
        h * (0.34 + i * 0.16),
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}
module.exports = { drawScene };
