function drawBasketballCourt(
  ctx,
  state,
  material,
  width,
  height,
  elapsed,
  reduced = false,
) {
  const w = width,
    h = height,
    goal = state.hoop;
  ctx.save();
  const floor = ctx.createLinearGradient(0, h * 0.9, 0, h * 1.06);
  floor.addColorStop(0, "#5c417600");
  floor.addColorStop(0.4, "#47315c35");
  floor.addColorStop(1, "#b18bca04");
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.ellipse(w * 0.78, h * 0.995, w * 0.76, h * 0.095, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#cab6e344";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(w * 0.78, h * 0.995, w * 0.73, h * 0.085, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(w * 0.53, h * 0.965, w * 0.22, h * 0.043, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Tempered-glass board, metal support and a perspective rim face the player on the left.
  const gx = goal.x * w,
    gy = goal.y * h;
  ctx.strokeStyle = "#9ba5bcaa";
  ctx.lineWidth = Math.max(2, w * 0.008);
  ctx.beginPath();
  ctx.moveTo(gx + w * 0.1, gy - h * 0.03);
  ctx.lineTo(gx + w * 0.16, gy + h * 0.07);
  ctx.lineTo(gx + w * 0.16, h * 0.985);
  ctx.stroke();
  ctx.fillStyle = "#dddaf529";
  ctx.strokeStyle = "#e7e9f4db";
  ctx.lineWidth = Math.max(1, w * 0.006);
  ctx.beginPath();
  ctx.moveTo(gx + w * 0.025, gy - h * 0.21);
  ctx.lineTo(gx + w * 0.2, gy - h * 0.225);
  ctx.lineTo(gx + w * 0.2, gy - h * 0.035);
  ctx.lineTo(gx + w * 0.025, gy - h * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#ffffffbb";
  ctx.lineWidth = 1;
  ctx.strokeRect(gx + w * 0.05, gy - h * 0.112, w * 0.085, h * 0.065);
  const netBottom = gy + h * (0.14 + state.net);
  ctx.strokeStyle = "#eee5dfbc";
  ctx.lineWidth = Math.max(0.7, w * 0.003);
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(gx + i * w * 0.024, gy + h * 0.014);
    ctx.lineTo(gx + i * w * 0.014, netBottom);
    ctx.stroke();
    if (i < 3) {
      ctx.beginPath();
      ctx.moveTo(gx + i * w * 0.024, gy + h * 0.014);
      ctx.lineTo(gx + (i + 1) * w * 0.014, netBottom);
      ctx.stroke();
    }
  }
  for (let level = 1; level < 4; level++) {
    const f = level / 4;
    ctx.beginPath();
    ctx.ellipse(
      gx,
      gy + (netBottom - gy) * f,
      w * (0.08 - 0.03 * f),
      h * 0.012,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.strokeStyle = "#dd7847";
  ctx.lineWidth = Math.max(2, w * 0.009);
  ctx.beginPath();
  ctx.ellipse(gx, gy, w * 0.085, h * 0.025, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  if (!reduced && state.trail) {
    state.trail.forEach((p, i) => {
      ctx.fillStyle = `rgba(244,211,159,${0.28 - i * 0.045})`;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, w * (0.018 - i * 0.002), 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const p = state.ball;
  if (p && material?.complete) {
    const r = w * 0.052,
      altitude = Math.max(0, 0.945 - p.y),
      squash = p.compression || 1;
    ctx.fillStyle = `rgba(32,22,44,${Math.max(0.07, 0.22 - altitude * 0.15)})`;
    ctx.beginPath();
    ctx.ellipse(
      p.x * w,
      h * 0.996,
      r * (1.1 + altitude * 0.35),
      r * 0.2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.save();
    ctx.translate(p.x * w, p.y * h);
    ctx.scale(1 / squash, squash);
    ctx.rotate(reduced ? 0 : elapsed / 620);
    ctx.drawImage(material, -r, -r, r * 2, r * 2);
    ctx.restore();
    // Fixed light keeps the material's rotating grain from appearing flat.
    ctx.save();
    ctx.translate(p.x * w, p.y * h);
    ctx.scale(1 / squash, squash);
    const shade = ctx.createRadialGradient(
      -r * 0.3,
      -r * 0.45,
      0,
      r * 0.25,
      r * 0.25,
      r * 1.05,
    );
    shade.addColorStop(0, "#fff5d82b");
    shade.addColorStop(0.6, "#00000000");
    shade.addColorStop(1, "#2a13092b");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = "#ffad70";
  ctx.lineWidth = Math.max(2, w * 0.01);
  ctx.beginPath();
  ctx.ellipse(gx, gy, w * 0.085, h * 0.025, 0, 0, Math.PI);
  ctx.stroke();
  if (state.burst > 0) {
    ctx.globalAlpha = state.burst;
    ctx.font = `${Math.max(15, w * 0.07)}px Georgia`;
    ctx.fillStyle = "#ffe1a1";
    ctx.textAlign = "center";
    ctx.fillText(
      state.combo >= 3
        ? `连进 ${state.combo} ✦`
        : state.shot?.perfect
          ? "SWISH ✦"
          : "NICE SHOT",
      gx,
      gy - h * 0.28,
    );
    if (!reduced)
      for (let i = 0; i < Math.min(30, 16 + (state.combo || 0) * 2); i++) {
        const a = i * 2.399963,
          dist = (1 - state.burst) * w * 0.3;
        ctx.fillText(
          "✦",
          gx + Math.cos(a) * dist,
          gy + Math.sin(a) * dist * 0.7,
        );
      }
  }
  ctx.restore();
}
module.exports = { drawBasketballCourt };
