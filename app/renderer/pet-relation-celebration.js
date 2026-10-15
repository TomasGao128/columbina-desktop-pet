// The ceremony belongs to the character, not the unlock card. No frames or input ownership.
function createPetRelationCelebration(
  container,
  { tier, line, maximum = false, preview = false, reduced = false },
) {
  const layer = document.createElement("div");
  layer.className = "pet-upgrade";
  layer.dataset.maximum = String(maximum);
  layer.dataset.reduced = String(reduced);
  const visual = document.createElement("div");
  visual.className = "pet-upgrade-visual";
  visual.setAttribute("aria-hidden", "true");
  layer.appendChild(visual);
  function add(className, parent = visual) {
    const el = document.createElement("span");
    el.className = className;
    parent.appendChild(el);
    return el;
  }
  add("pet-upgrade-aura");
  add("pet-upgrade-rays");
  for (let i = 0; i < 3; i++) {
    const ring = add("pet-upgrade-ring");
    ring.style.setProperty("--delay", `${i * 360}ms`);
    ring.style.setProperty("--tilt", `${i * 55 - 45}deg`);
  }
  add("pet-upgrade-floor");
  for (let i = 0; i < (reduced ? 12 : maximum ? 108 : 84); i++) {
    const star = add("pet-upgrade-star");
    const angle = i * 2.399963;
    const radius = 32 + (i % 11) * 5.7;
    star.textContent = i % 6 === 0 ? "♡" : i % 3 === 0 ? "✧" : "✦";
    star.style.setProperty("--x", `${Math.cos(angle) * radius}%`);
    star.style.setProperty("--y", `${Math.sin(angle) * radius * 0.82}%`);
    star.style.setProperty("--delay", `${(i % 12) * 85}ms`);
    star.style.setProperty("--duration", `${2400 + (i % 5) * 210}ms`);
    star.style.setProperty("--tone", ["#fff0b7", "#d1afff", "#a9efff"][i % 3]);
    star.style.setProperty("--size", `${i % 6 === 0 ? 22 : 8 + (i % 4) * 3}px`);
  }
  if (!reduced)
    for (let i = 0; i < 16; i++) {
      const beam = add("pet-upgrade-beam");
      beam.style.left = `${8 + i * 5.6}%`;
      beam.style.setProperty("--delay", `${(i % 8) * 150}ms`);
      beam.style.setProperty("--height", `${20 + (i % 5) * 8}%`);
    }
  const speech = add("pet-upgrade-speech", layer);
  speech.setAttribute("role", "status");
  speech.setAttribute("aria-live", "polite");
  const heading = document.createElement("strong");
  heading.textContent = `${preview ? "仪式预览 · " : "亲密度升级 · "}「${tier}」`;
  const quote = document.createElement("span");
  quote.textContent = line;
  speech.append(heading, quote);
  const ribbon = add("pet-upgrade-ribbon", layer);
  ribbon.textContent = maximum
    ? "✦ 满级羁绊 · 月光为你盛放 ✦"
    : "✦ 我们又靠近了一点 ✦";
  container.appendChild(layer);
  return layer;
}
module.exports = { createPetRelationCelebration };
