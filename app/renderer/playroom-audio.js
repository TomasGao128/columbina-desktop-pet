function createPlayroomAudio(enabled) {
  let context = null;
  const voices = new Set();
  function play(kind) {
    if (!enabled()) return;
    try {
      context ||= new AudioContext();
      context.resume().catch(() => {});
      if (voices.size > 5) return;
      const gain = context.createGain(),
        tone = context.createOscillator(),
        at = context.currentTime;
      tone.type = kind === "rim" ? "triangle" : "sine";
      tone.frequency.setValueAtTime(
        kind === "bounce" ? 135 : kind === "swish" ? 540 : 860,
        at,
      );
      tone.frequency.exponentialRampToValueAtTime(
        kind === "bounce" ? 58 : kind === "swish" ? 220 : 440,
        at + 0.11,
      );
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(
        kind === "bounce" ? 0.045 : 0.03,
        at + 0.008,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      tone.connect(gain);
      gain.connect(context.destination);
      voices.add(tone);
      tone.onended = () => {
        voices.delete(tone);
        tone.disconnect();
        gain.disconnect();
      };
      tone.start(at);
      tone.stop(at + 0.15);
    } catch (_) {
      /* Audio does not own activity state. */
    }
  }
  function clear() {
    for (const tone of voices) {
      try {
        tone.stop();
      } catch (_) {}
    }
    voices.clear();
  }
  return {
    play,
    clear,
    dispose() {
      clear();
      context?.close().catch(() => {});
      context = null;
    },
  };
}
module.exports = { createPlayroomAudio };
