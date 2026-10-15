(() => {
  let previous = "";
  const update = () => {
    const value = {
      rect: {
        x: petContainer.offsetLeft,
        y: petContainer.offsetTop,
        width: pet.offsetWidth,
        height: pet.offsetHeight,
      },
      paused: focusMode || dragging || burstActive,
      reduced:
        reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
    const key = JSON.stringify(value);
    if (key !== previous) {
      previous = key;
      ipcRenderer.send("weather-pet-state", value);
    }
  };
  const timer = setInterval(update, 200);
  update();
  window.addEventListener("beforeunload", () => clearInterval(timer), {
    once: true,
  });
})();
