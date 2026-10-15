(() => {
  const effect = new URLSearchParams(location.search).get("view") === "effect",
    canvas = document.getElementById("sky"),
    ctx = canvas.getContext("2d");
  if (!effect) {
    canvas.hidden = true;
    document.body.className = "panel";
    document.getElementById("controls").hidden = false;
    let config = { theme: "off", range: 700, density: 55, brightness: 60 },
      timer,
      editing = false,
      revision = 0;
    const render = () => {
      for (const key of ["range", "density", "brightness"]) {
        document.getElementById(key).value = config[key];
        document.getElementById(key + "Value").textContent =
          config[key] + (key === "range" ? " px" : "%");
      }
      for (const button of document.querySelectorAll("[data-theme]"))
        button.dataset.active = String(button.dataset.theme === config.theme);
    };
    const save = async () => {
      clearTimeout(timer);
      timer = null;
      const version = ++revision;
      editing = true;
      const result = await weather.save({ ...config });
      if (version !== revision) return;
      editing = false;
      document.getElementById("status").textContent = result.ok
        ? config.theme === "off"
          ? "氛围已关闭。"
          : "已保存，退出专注或结束拖动后恢复。"
        : result.error || "保存失败。";
    };
    for (const button of document.querySelectorAll("[data-theme]"))
      button.onclick = () => {
        config.theme = button.dataset.theme;
        render();
        save();
      };
    for (const key of ["range", "density", "brightness"])
      document.getElementById(key).oninput = (e) => {
        config[key] = Number(e.target.value);
        editing = true;
        revision++;
        render();
        clearTimeout(timer);
        timer = setTimeout(save, 180);
      };
    document.getElementById("off").onclick = () => {
      config.theme = "off";
      render();
      save();
    };
    weather.get().then((value) => {
      if (value) {
        config = value;
        render();
      }
    });
    weather.onSettings((value) => {
      if (editing) return;
      config = value;
      render();
    });
    return;
  }
  let settings = {
      theme: "off",
      density: 55,
      brightness: 60,
      paused: true,
      reduced: false,
    },
    frame = null,
    last = 0,
    time = 0,
    width = 1,
    height = 1;
  const particles = Array.from({ length: 150 }, (_, i) => ({
    x: (i * 0.61803398875) % 1,
    y: (i * 0.41421356) % 1,
    size: 1 + (i % 5),
    phase: i * 1.37,
  }));
  function resize() {
    width = innerWidth;
    height = innerHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (settings.paused || settings.theme === "off") return;
    const alpha = settings.brightness / 100,
      count = Math.round(15 + settings.density * 0.95),
      t = time;
    if (settings.theme === "night") {
      const mx = width * 0.76,
        my = height * 0.17;
      ctx.save();
      ctx.fillStyle = `rgba(232,224,255,${Math.min(1, alpha * 0.95)})`;
      ctx.shadowColor = "rgba(193,177,244,.25)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(mx, my, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(mx + 11, my - 6, 23, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      ctx.globalAlpha = alpha * (0.3 + 0.5 * (p.size / 5));
      ctx.lineWidth = 0.6 + p.size * 0.12;
      if (settings.theme === "rain") {
        const x = (p.x * width + t * (12 + p.size * 2)) % width,
          y = (p.y * height + t * (100 + p.size * 28)) % height;
        ctx.strokeStyle = "#b8d6f6";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3 - p.size, y + 12 + p.size * 3);
        ctx.stroke();
        if (i % 5 === 0) {
          const phase = (t * 0.65 + p.x) % 1;
          ctx.globalAlpha = alpha * (1 - phase) * 0.35;
          ctx.beginPath();
          ctx.ellipse(
            p.x * width,
            height * (0.78 + p.y * 0.18),
            3 + phase * 20,
            1 + phase * 5,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
      } else if (settings.theme === "butterflies") {
        const x = ((p.x * width + t * (6 + p.size)) % (width + 48)) - 24;
        const y = p.y * height + Math.sin(t * 0.5 + p.phase) * 26;
        if (i % 4 !== 0) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.fillStyle = "#c9b9dd";
          ctx.beginPath();
          ctx.arc(x, y, 0.6 + p.size * 0.15, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(t * 0.7 + p.phase) * 0.4);
          const size = 0.55 + p.size * 0.1;
          ctx.scale(size, size);
          ctx.globalAlpha = Math.min(1, alpha * 0.95);
          const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.5 + p.phase));
          for (const side of [-1, 1]) {
            ctx.save();
            ctx.scale(side * flap, 1);
            const tint = i % 3 === 0 ? "#b1ccea" : "#c9b3e7";
            const gradient = ctx.createLinearGradient(0, 0, 12, -6);
            gradient.addColorStop(0, "#f5eafa");
            gradient.addColorStop(1, tint);
            ctx.fillStyle = gradient;
            ctx.strokeStyle = "#9a8bb7";
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(3, -7, 13, -11, 12, -3);
            ctx.bezierCurveTo(12, 1, 6, 2, 0, 0);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(6, -1, 12, 4, 8, 7);
            ctx.bezierCurveTo(3, 9, 1, 4, 0, 0);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fff7ff";
            ctx.beginPath();
            ctx.arc(9, -4, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(1, 0);
            ctx.lineTo(8, -4);
            ctx.moveTo(1, 1);
            ctx.lineTo(6, 5);
            ctx.stroke();
            ctx.restore();
          }
          ctx.strokeStyle = "#817497";
          ctx.lineWidth = 1;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(0, -3);
          ctx.lineTo(0, 5);
          ctx.moveTo(0, -3);
          ctx.quadraticCurveTo(-1, -6, -3, -6);
          ctx.moveTo(0, -3);
          ctx.quadraticCurveTo(1, -6, 3, -6);
          ctx.stroke();
          ctx.restore();
        }
      } else if (settings.theme === "wind") {
        const x = ((p.x * width + t * (20 + p.size * 5)) % (width + 40)) - 20,
          y = p.y * height + Math.sin(t * 0.8 + p.phase) * 25;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t + p.phase) * 0.8);
        ctx.fillStyle = i % 4 === 0 ? "#edf0ff" : "#e9c0ea";
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          p.size + 2,
          i % 4 === 0 ? 1.3 : 2.7,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        if (i % 4 === 0) {
          ctx.strokeStyle = "#cabee8";
          ctx.beginPath();
          ctx.moveTo(-p.size - 3, 0);
          ctx.lineTo(p.size + 3, 0);
          for (let barb = -3; barb <= 3; barb++) {
            ctx.moveTo(barb * 1.5, 0);
            ctx.lineTo(barb * 1.5 + 1.8, -2.8);
            ctx.moveTo(barb * 1.5, 0);
            ctx.lineTo(barb * 1.5 + 1.8, 2.8);
          }
          ctx.stroke();
        }
        ctx.restore();
      } else if (settings.theme === "snow") {
        ctx.globalAlpha = Math.min(1, alpha * (0.65 + (0.65 * p.size) / 5));
        ctx.lineWidth = 1 + p.size * 0.2;
        const x =
          (p.x * width +
            Math.sin(t * 0.35 + p.phase) * (12 + p.size * 3) +
            width) %
          width;
        const y = ((p.y * height + t * (9 + p.size * 4)) % (height + 20)) - 10;
        {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * (i % 2 === 0 ? 0.11 : -0.08) + p.phase);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          const r = i % 4 === 0 ? 3 + p.size * 0.35 : 7 + p.size;
          ctx.beginPath();
          for (let arm = 0; arm < 6; arm++) {
            const a = (arm * Math.PI) / 3;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            if (r > 5)
              for (const distance of [0.44, 0.73]) {
                const bx = Math.cos(a) * r * distance,
                  by = Math.sin(a) * r * distance;
                const branch = r * (distance < 0.5 ? 0.26 : 0.21);
                ctx.moveTo(
                  bx + Math.cos(a - 0.86) * branch,
                  by + Math.sin(a - 0.86) * branch,
                );
                ctx.lineTo(bx, by);
                ctx.lineTo(
                  bx + Math.cos(a + 0.86) * branch,
                  by + Math.sin(a + 0.86) * branch,
                );
              }
          }
          if (r > 5 && i % 3 === 0) {
            for (let n = 0; n <= 6; n++) {
              const a = (n * Math.PI) / 3,
                hx = Math.cos(a) * r * 0.2,
                hy = Math.sin(a) * r * 0.2;
              if (n === 0) ctx.moveTo(hx, hy);
              else ctx.lineTo(hx, hy);
            }
          }
          ctx.strokeStyle = "#a9c9e9";
          ctx.lineWidth = r > 5 ? 1.6 : 0.9;
          ctx.stroke();
          ctx.strokeStyle = "#f5fbff";
          ctx.lineWidth = r > 5 ? 0.65 : 0.4;
          ctx.stroke();
          ctx.restore();
        }
      } else if (settings.theme === "fireflies") {
        const x = p.x * width + Math.sin(t * 0.32 + p.phase) * 22,
          y = p.y * height + Math.cos(t * 0.41 + p.phase) * 17;
        ctx.globalAlpha = Math.min(
          1,
          alpha * (0.48 + 0.9 * (0.5 + 0.5 * Math.sin(t * 1.2 + p.phase))),
        );
        ctx.fillStyle = i % 3 === 0 ? "#bedc76" : "#f4ca58";
        ctx.shadowColor = "#e1d867";
        ctx.shadowBlur = 11;
        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          1.5 + p.size * 0.34,
          1.2 + p.size * 0.26,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (settings.theme === "maple") {
        const x =
            ((p.x * width +
              t * (9 + p.size * 2) +
              Math.sin(t * 0.7 + p.phase) * 17) %
              (width + 30)) -
            15,
          y = ((p.y * height + t * (13 + p.size * 3)) % (height + 30)) - 15;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.phase + Math.sin(t * 0.8 + p.phase) * 1.4);
        ctx.scale(
          0.75 + p.size * 0.14,
          0.6 + Math.abs(Math.cos(t * 0.6 + p.phase)) * 0.5,
        );
        ctx.fillStyle = ["#d99367", "#e4b879", "#d17d70"][i % 3];
        ctx.beginPath();
        ctx.moveTo(0, 7);
        ctx.lineTo(-5, 3);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-8, -3);
        ctx.lineTo(-3, -4);
        ctx.lineTo(0, -9);
        ctx.lineTo(3, -4);
        ctx.lineTo(8, -3);
        ctx.lineTo(4, 0);
        ctx.lineTo(5, 3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#b87b64";
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(0, -5);
        ctx.moveTo(0, 3);
        ctx.lineTo(-4, -1);
        ctx.moveTo(0, 3);
        ctx.lineTo(4, -1);
        ctx.stroke();
        ctx.restore();
      } else if (settings.theme === "blossom") {
        const x =
            ((p.x * width +
              t * (12 + p.size * 3) +
              Math.sin(t * 0.55 + p.phase) * 25) %
              (width + 30)) -
            15,
          y = ((p.y * height + t * (12 + p.size * 2)) % (height + 30)) - 15;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.phase + t * 0.2 + Math.sin(t * 0.7 + p.phase));
        ctx.scale(
          0.7 + p.size * 0.16,
          0.5 + Math.abs(Math.cos(t * 0.55 + p.phase)) * 0.6,
        );
        ctx.fillStyle = i % 3 === 0 ? "#fff3f2" : "#eec9dc";
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.bezierCurveTo(-9, 0, -5, -9, 0, -5);
        ctx.bezierCurveTo(5, -9, 9, 0, 0, 6);
        ctx.fill();
        ctx.restore();
      } else {
        const x = p.x * width,
          y = p.y * height;
        ctx.globalAlpha = Math.min(
          1,
          alpha * (0.55 + 0.8 * (0.5 + 0.5 * Math.sin(t * 0.8 + p.phase))),
        );
        ctx.fillStyle = ["#acbde9", "#b9a4df", "#eee9ff"][i % 3];
        ctx.fillRect(x, y, p.size * 0.65 + 0.8, p.size * 0.65 + 0.8);
        if (i % 12 === 0) {
          ctx.strokeStyle = "#cbd5ff";
          ctx.beginPath();
          ctx.moveTo(x - 4, y);
          ctx.lineTo(x + 4, y);
          ctx.moveTo(x, y - 4);
          ctx.lineTo(x, y + 4);
          ctx.stroke();
        }
      }
    }
    if (settings.theme === "night" && !settings.reduced) {
      const cycle = t % 13;
      if (cycle < 1.1) {
        const x = width * (0.12 + cycle * 0.65),
          y = height * (0.1 + cycle * 0.35);
        ctx.globalAlpha = alpha * Math.sin((cycle / 1.1) * Math.PI) * 0.65;
        const g = ctx.createLinearGradient(x - 65, y - 30, x, y);
        g.addColorStop(0, "rgba(219,214,255,0)");
        g.addColorStop(1, "#ebe8ff");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 65, y - 30);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    canvas.dataset.theme = settings.theme;
    canvas.dataset.count = count;
  }
  function tick(now) {
    frame = null;
    if (settings.paused || settings.reduced || settings.theme === "off") return;
    if (now - last >= 32) {
      time += Math.min(0.05, (now - last) / 1000);
      last = now;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  weather.onRender((value) => {
    const changed = settings.theme !== value.theme;
    settings = value;
    if (changed) time = 2;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    last = performance.now();
    draw();
    if (!settings.paused && !settings.reduced && settings.theme !== "off")
      frame = requestAnimationFrame(tick);
  });
  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", () => {
    if (frame !== null) cancelAnimationFrame(frame);
  });
  resize();
})();
