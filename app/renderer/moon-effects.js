// Local, bounded particles. Animation ownership follows the current pet action.
function installMoonEffects({
  container,
  reduced = () => false,
  focused = () => false,
  opacity = () => 1,
}) {
  const host = document.createElement("div");
  host.className = "moon-effects";
  host.setAttribute("aria-hidden", "true");
  container.appendChild(host);
  let timer = null,
    disposed = false,
    theme = "moon";
  const palettes = {
    moon: ["#67d9ff", "#a98bff", "#fff1bb"],
    heart: ["#ff88be", "#ffbeec", "#fff0ba"],
    gold: ["#ffd575", "#ffae76", "#fff0bd"],
    dream: ["#b99cff", "#78b8ff", "#e0d4ff"],
  };
  const heart = /touch|pinch|heart|happy|shy|cake|cheer|laugh|coax/;
  function clear() {
    clearTimeout(timer);
    timer = null;
    host.replaceChildren();
    host.removeAttribute("data-key");
  }
  function particle(kind, x, y, i, slow = false) {
    const p = document.createElement("i");
    p.className = "moon-particle " + kind;
    p.style.left = x + "%";
    p.style.top = y + "%";
    const angle = i * 2.399963,
      travel = slow ? 12 : 20 + (i % 7) * 7;
    p.style.setProperty("--px", Math.cos(angle) * travel + "px");
    p.style.setProperty("--py", Math.sin(angle) * travel - 22 + "px");
    p.style.setProperty("--turn", (i % 2 ? -34 : 34) + "deg");
    p.style.setProperty("--delay", (i % 8) * 65 + "ms");
    p.style.setProperty(
      "--life",
      slow ? "3200ms" : 1500 + (i % 5) * 150 + "ms",
    );
    p.style.setProperty("--tone", palettes[theme][i % 3]);
    p.style.setProperty(
      "--ps",
      (kind === "dust" ? 3 + (i % 3) : 9 + (i % 5)) + "px",
    );
    p.textContent =
      kind === "heart"
        ? "♥"
        : kind === "note"
          ? i % 2
            ? "♪"
            : "♫"
          : kind === "feather"
            ? ""
            : kind === "star"
              ? "✦"
              : "";
    host.appendChild(p);
  }
  function play(key, { duration = 2800, variant = key } = {}) {
    clear();
    if (disposed || focused()) return false;
    host.style.opacity = String(
      Math.max(0, Math.min(1, opacity())) *
        (/^(pose|coser):/.test(key) ? 0.42 : 1),
    );
    theme = /cake|wish|bow|cheer/.test(variant)
      ? "gold"
      : heart.test(variant)
        ? "heart"
        : /yawn|sleep|rest|sad|ignore/.test(variant)
          ? "dream"
          : "moon";
    host.dataset.key = key;
    host.style.setProperty("--vfx-main", palettes[theme][0]);
    host.style.setProperty("--vfx-accent", palettes[theme][1]);
    host.classList.toggle("moon-still", reduced());
    if (!reduced()) {
      const kind = heart.test(variant)
        ? "heart"
        : /sing|notes/.test(variant)
          ? "note"
          : /feather/.test(variant)
            ? "feather"
            : "star";
      const count = /^(pose|coser):/.test(key)
        ? 16
        : /wish|drag/.test(key)
          ? 28
          : 20;
      for (let i = 0; i < count; i++) {
        const side = i % 2 ? 1 : -1,
          x = 50 + side * (18 + (i % 6) * 3),
          y = /touch/.test(key) ? 22 + (i % 5) * 4 : 20 + (i % 7) * 9;
        particle(i % 3 ? "dust" : kind, x, y, i, /sleep|yawn|pose/.test(key));
      }
      if (/wish|pose-moon|moon/.test(variant)) {
        const arc = document.createElement("i");
        arc.className = "moon-orbit";
        host.appendChild(arc);
      }
    }
    timer = setTimeout(clear, Math.max(1800, Math.min(9000, duration)));
    return true;
  }
  return {
    play,
    clear,
    get status() {
      return {
        key: host.dataset.key || null,
        particles: host.querySelectorAll(".moon-particle").length,
        nodes: host.childElementCount,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      host.remove();
    },
  };
}
if (typeof module !== "undefined") module.exports = { installMoonEffects };
