// One audio owner for reactions and stories; captions follow actual playback time.
function createVoicePlayer({
  catalog,
  enabled,
  caption,
  clearCaption,
  onChange = () => {},
  onError = () => {},
  volume = () => 1,
  AudioType = globalThis.Audio,
  random = Math.random,
  now = Date.now,
}) {
  const clips = new Map(catalog.clips.map((c) => [c.id, c]));
  let current = null,
    audio = null,
    token = 0,
    timer = null,
    lastAuto = -Infinity,
    lastCaption = -1;
  const recent = [];
  const status = () => ({
    active: !!current,
    story: !!current?.story,
    clipId: current?.clip.id || null,
    title: current?.title || '',
    time: audio?.currentTime || 0,
    duration: audio?.duration || current?.clip.duration || 0,
    paused: audio?.paused ?? true,
  });
  function stop(clear = true) {
    token++;
    clearInterval(timer);
    timer = null;
    const old = audio;
    audio = null;
    current = null;
    lastCaption = -1;
    if (old) {
      old.onended = old.onerror = old.ontimeupdate = old.onloadedmetadata = old.onseeked = null;
      old.pause();
      old.removeAttribute?.('src');
      old.load?.();
    }
    if (clear) clearCaption();
    onChange(status());
  }
  function pick(context) {
    const ids = catalog.contexts[context] || catalog.contexts[context.split(':')[0]] || [];
    const options = ids.map((id) => clips.get(id)).filter(Boolean);
    const fresh = options.filter((c) => !recent.includes(c.id));
    const pool = fresh.length ? fresh : options;
    return pool.length ? pool[Math.floor(random() * pool.length)] : null;
  }
  function updateCaption() {
    if (!current || !audio) return;
    const segments = current.clip.segments || [];
    const index = Math.max(
      0,
      segments.findLastIndex((s) => s.start <= audio.currentTime),
    );
    if (index !== lastCaption) {
      lastCaption = index;
      const segment = segments[index];
      caption(
        segment?.text || current.clip.text,
        Math.max(1800, ((segment?.end || current.clip.duration) - audio.currentTime) * 1000 + 500),
      );
    }
    onChange(status());
  }
  function playClip(clip, { story = false, title = '', automatic = false } = {}) {
    if (!clip || !enabled()) return false;
    if (automatic && (current || now() - lastAuto < 90000)) return false;
    stop(false);
    const version = token;
    current = { clip, story, title };
    audio = new AudioType(clip.file);
    audio.preload = 'auto';
    audio.volume = Math.max(0, Math.min(1, volume()));
    recent.push(clip.id);
    if (recent.length > 3) recent.shift();
    if (automatic) lastAuto = now();
    const finish = () => {
      if (version !== token) return;
      stop(false);
      caption(clip.segments?.at(-1)?.text || clip.text, 1400);
    };
    const fail = (error) => {
      if (version !== token) return;
      stop();
      onError(error);
    };
    audio.onended = finish;
    audio.onerror = () => fail(new Error('Voice file failed to load: ' + clip.id));
    audio.ontimeupdate = audio.onloadedmetadata = audio.onseeked = updateCaption;
    updateCaption();
    timer = setInterval(updateCaption, 150);
    try {
      Promise.resolve(audio.play()).catch(fail);
    } catch (error) {
      fail(error);
    }
    return true;
  }
  return {
    playContext(context, options) {
      return playClip(pick(context), options);
    },
    playStory(id) {
      const story = catalog.stories.find((s) => s.id === id);
      return story ? playClip(clips.get(story.clipId), { story: true, title: story.title }) : false;
    },
    stop,
    updateCaption,
    setVolume() {
      if (audio) audio.volume = Math.max(0, Math.min(1, volume()));
    },
    get status() {
      return status();
    },
    get currentAudio() {
      return audio;
    },
    dispose() {
      stop();
    },
  };
}
module.exports = { createVoicePlayer };
