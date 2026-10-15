const { createEmotionMemory } = require("../core/emotion-memory");
function installEmotion({
  saved,
  onSave,
  speak,
  canSpeak,
  autonomous = true,
  now = Date.now,
}) {
  const model = createEmotionMemory(saved, now());
  let announced = -Infinity,
    disposed = false;
  const persist = () => onSave(model.snapshot);
  function event(kind, detail = {}) {
    if (disposed) return false;
    const changed = model.event(kind, detail, now());
    persist();
    if (
      changed &&
      ["happy", "determined"].includes(model.snapshot.mood) &&
      now() - announced > 2500
    ) {
      announced = now();
      speak(model.description.text);
    }
    return changed;
  }
  const timer = setInterval(() => {
    if (disposed) return;
    if (model.tick(now())) persist();
    if (
      autonomous &&
      model.snapshot.mood === "lonely" &&
      canSpeak() &&
      now() - announced > 10 * 60000
    ) {
      announced = now();
      speak(model.description.text);
    }
  }, 30000);
  return {
    event,
    get status() {
      return { ...model.snapshot, ...model.description };
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
    },
  };
}
module.exports = { installEmotion };
