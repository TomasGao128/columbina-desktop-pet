// Reactions own only their overlay and temporary rotation, never sprite frames.
function installPetReactions({
  container,
  image,
  allowed,
  reduced,
  begin,
  finish,
  hit = (target) => target === image,
}) {
  const host = document.createElement('div');
  host.className = 'pet-reactions';
  host.setAttribute('aria-hidden', 'true');
  container.appendChild(host);
  let clicks = [],
    timer = null,
    animation = null,
    active = false,
    disposed = false;
  let cooldownUntil = 0;

  function cancel() {
    const wasActive = active;
    active = false;
    clicks = [];
    clearTimeout(timer);
    timer = null;
    animation?.cancel();
    animation = null;
    host.replaceChildren();
    host.removeAttribute('data-effect');
    return wasActive;
  }

  function dizzy() {
    if (disposed || !allowed() || Date.now() < cooldownUntil) return false;
    cancel();
    begin();
    active = true;
    cooldownUntil = Date.now() + 7000;
    host.dataset.effect = 'dizzy';
    host.classList.toggle('reduced', reduced());
    for (let i = 0; i < 5; i++) {
      const star = document.createElement('span');
      star.className = 'reaction-star';
      star.textContent = '✦';
      star.style.setProperty('--index', i);
      host.appendChild(star);
    }
    if (!reduced()) {
      animation = image.animate(
        [
          { rotate: '0deg' },
          { rotate: '-4deg' },
          { rotate: '4deg' },
          { rotate: '-2deg' },
          { rotate: '0deg' },
        ],
        { duration: 2800, easing: 'ease-in-out' },
      );
    }
    timer = setTimeout(() => {
      cancel();
      finish();
    }, 2800);
    return true;
  }

  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0 || !hit(event.target) || !allowed()) {
      clicks = [];
      return;
    }
    if (active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const now = Date.now();
    clicks = clicks.filter((at) => now - at <= 1800);
    clicks.push(now);
    if (clicks.length >= 5 && dizzy()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function edge(side) {
    if (disposed || active || !['left', 'right'].includes(side)) return;
    cancel();
    host.dataset.effect = side;
    host.classList.toggle('reduced', reduced());
    const glow = document.createElement('span');
    glow.className = 'reaction-edge';
    glow.textContent = '☾';
    host.appendChild(glow);
    timer = setTimeout(cancel, 2200);
  }

  container.addEventListener('click', onClick, true);
  return {
    dizzy,
    edge,
    cancel,
    get active() {
      return active;
    },
    dispose() {
      if (active) {
        cancel();
        finish();
      } else cancel();
      disposed = true;
      container.removeEventListener('click', onClick, true);
      host.remove();
    },
  };
}
module.exports = { installPetReactions };
