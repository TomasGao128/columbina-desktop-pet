// Animate the original garment pixels; the displacement is neutral outside sleeves/tails.
(function (scope) {
  const NS = 'http://www.w3.org/2000/svg';
  function installIdleCloth({ image, canAnimate }) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';
    svg.setAttribute('aria-hidden', 'true');
    const mask = `<svg xmlns="${NS}" width="1280" height="1280" viewBox="0 0 1280 1280"><defs><radialGradient id="g"><stop stop-color="white" stop-opacity=".9"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><g fill="url(#g)"><ellipse cx="470" cy="654" rx="98" ry="160"/><ellipse cx="812" cy="654" rx="98" ry="160"/><ellipse cx="482" cy="1000" rx="91" ry="112"/><ellipse cx="800" cy="1000" rx="91" ry="112"/></g></svg>`;
    svg.innerHTML = `<defs><filter id="idleCloth" x="-3%" y="-3%" width="106%" height="106%" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="32 24" numOctaves="1" seed="7" result="noise"/><feOffset in="noise" result="moving"/><feImage href="data:image/svg+xml,${encodeURIComponent(mask)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="garment"/><feComposite in="moving" in2="garment" operator="in" result="masked"/><feFlood flood-color="rgb(128,128,128)" result="neutral"/><feComposite in="masked" in2="neutral" operator="over" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale=".022" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
    document.body.appendChild(svg);
    const offset = svg.querySelector('feOffset'),
      media = matchMedia('(prefers-reduced-motion: reduce)');
    function syncPose() {
      // Rest assets are already calibrated in the shared 640px canvas.
      // Keep only the global layout scale, including during breathing.
      image.style.setProperty('--pose-scale', '1');
      image.dataset.poseScale = '1';
    }
    const observer = new MutationObserver(syncPose);
    observer.observe(image, { attributes: true, attributeFilter: ['src'] });
    syncPose();
    let frame = 0,
      last = 0,
      disposed = false;
    function tick(now) {
      if (disposed) return;
      if (now - last >= 42) {
        last = now;
        const active =
          !document.hidden &&
          !media.matches &&
          canAnimate() &&
          /\/frame-1\.webp(?:$|[?#])/.test(image.src);
        image.classList.toggle('idle-cloth', active);
        if (active) {
          offset.setAttribute('dx', String(Math.sin(now / 2100) * 0.025));
          offset.setAttribute('dy', String(Math.cos(now / 2900) * 0.019));
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return {
      syncPose,
      dispose() {
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        image.classList.remove('idle-cloth');
        svg.remove();
      },
    };
  }
  scope.installIdleCloth = installIdleCloth;
})(globalThis);
