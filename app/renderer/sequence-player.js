// One owner for frame timers. A canceled sequence cannot render or complete later.
(function (scope) {
  class PetSequencePlayer {
    constructor({
      prepare,
      render,
      schedule = (fn, ms) => setTimeout(fn, ms),
      unschedule = (timer) => clearTimeout(timer),
      requestFrame = (fn) => requestAnimationFrame(fn),
      cancelFrame = (id) => cancelAnimationFrame(id),
      now = () => performance.now(),
    }) {
      this.prepare = prepare;
      this.render = render;
      this.schedule = schedule;
      this.unschedule = unschedule;
      this.requestFrame = requestFrame;
      this.cancelFrame = cancelFrame;
      this.now = now;
      this.blendFrame = null;
      this.version = 0;
      this.timers = [];
      this.loading = null;
    }
    cancel() {
      this.version++;
      if (this.blendFrame !== null) this.cancelFrame(this.blendFrame);
      this.blendFrame = null;
      if (this.loading) this.loading.abort();
      this.loading = null;
      this.timers.forEach((timer) => this.unschedule(timer));
      this.timers = [];
    }
    async play(
      frames,
      {
        frameMs = 280,
        holdMs = 800,
        frameDurations,
        prepareTimeoutMs = 5000,
        onDone,
        onError,
        onFrame,
        onBlend,
        prepareExtra,
      } = {},
    ) {
      this.cancel();
      const version = this.version;
      const controller = new AbortController();
      this.loading = controller;
      let timeout;
      const fail = (error) => {
        if (version !== this.version) return;
        this.cancel();
        if (onError) onError(error);
      };
      try {
        // Own the playback plan across the asynchronous preload boundary.
        frames = [...frames];
        if (!frames.length) throw new Error("Empty animation");
        if (
          !Number.isFinite(frameMs) ||
          frameMs < 20 ||
          !Number.isFinite(holdMs) ||
          holdMs < 0
        )
          throw new Error("Invalid animation timing");
        if (frameDurations) {
          frameDurations = [...frameDurations];
          if (
            frameDurations.length !== frames.length ||
            frameDurations.some(
              (ms) => !Number.isFinite(ms) || ms < 20 || ms > 10000,
            )
          )
            throw new Error("Invalid frame durations");
        }
        const offsets = [0];
        for (let i = 1; i < frames.length; i++)
          offsets.push(
            offsets[i - 1] + (frameDurations ? frameDurations[i - 1] : frameMs),
          );
        await Promise.race([
          (async () => {
            await this.prepare(frames, { signal: controller.signal });
            if (prepareExtra)
              await prepareExtra(frames, { signal: controller.signal });
          })(),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Animation loading timed out")),
              prepareTimeoutMs,
            );
            controller.signal.addEventListener(
              "abort",
              () => reject(new Error("Animation canceled")),
              { once: true },
            );
          }),
        ]);
        clearTimeout(timeout);
        if (version !== this.version) return;
        this.loading = null;
        // One clock and one pending tick: late callbacks skip expired frames.
        const started = this.now();
        const end =
          offsets[frames.length - 1] +
          (frameDurations ? frameDurations[frames.length - 1] : holdMs);
        let shown = -1;
        const tick = () => {
          this.timers = [];
          if (version !== this.version) return;
          try {
            const elapsed = Math.max(0, this.now() - started);
            if (elapsed >= end) {
              onDone?.();
              return;
            }
            let index = 0;
            while (index + 1 < offsets.length && offsets[index + 1] <= elapsed)
              index++;
            if (index !== shown) {
              shown = index;
              this.render(frames[index]);
              onFrame?.(frames[index], index);
            }
            if (version !== this.version) return;
            if (onBlend && index + 1 < frames.length)
              onBlend(
                frames[index],
                frames[index + 1],
                Math.min(
                  1,
                  (elapsed - offsets[index]) /
                    (offsets[index + 1] - offsets[index]),
                ),
                index,
              );
            if (version !== this.version) return;
            this.timers = [this.schedule(tick, 16)];
          } catch (error) {
            fail(error);
          }
        };
        tick();
      } catch (error) {
        fail(error);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  // Cache only completed images. Pending loads belong to their sequence and can be aborted.
  function createFrameLoader(
    ImageType = scope.Image,
    { maxDecodedBytes = 96 * 1024 * 1024 } = {},
  ) {
    const cache = new Map();
    let decodedBytes = 0;
    function remember(src, image) {
      const bytes =
        (image.naturalWidth || image.width || 0) *
        (image.naturalHeight || image.height || 0) *
        4;
      if (bytes <= 0 || bytes > maxDecodedBytes) return;
      if (cache.has(src)) {
        decodedBytes -= cache.get(src).bytes;
        cache.delete(src);
      }
      while (cache.size && decodedBytes + bytes > maxDecodedBytes) {
        const oldest = cache.keys().next().value;
        decodedBytes -= cache.get(oldest).bytes;
        cache.delete(oldest);
      }
      cache.set(src, { image, bytes });
      decodedBytes += bytes;
    }
    const load = (frames, { signal } = {}) =>
      Promise.all(
        frames.map((src) => {
          if (cache.has(src)) {
            const entry = cache.get(src);
            cache.delete(src);
            cache.set(src, entry);
            return entry.image;
          }
          return new Promise((resolve, reject) => {
            const image = new ImageType();
            let settled = false;
            const cleanup = () => {
              image.onload = image.onerror = null;
              if (signal) signal.removeEventListener("abort", abort);
            };
            const fail = (error) => {
              if (settled) return;
              settled = true;
              cleanup();
              image.src = "";
              reject(error);
            };
            const abort = () => fail(new Error("Animation canceled"));
            if (signal && signal.aborted) {
              abort();
              return;
            }
            image.onload = async () => {
              try {
                // A successful load event does not guarantee decoded pixels are ready.
                if (typeof image.decode === "function") await image.decode();
                if (settled) return;
                settled = true;
                cleanup();
                if (!/[?&]play=/.test(src)) remember(src, image);
                resolve(image);
              } catch (error) {
                fail(error);
              }
            };
            image.onerror = () =>
              fail(new Error("Animation asset unavailable: " + src));
            if (signal) signal.addEventListener("abort", abort, { once: true });
            image.src = src;
          });
        }),
      );
    load.clear = () => {
      cache.clear();
      decodedBytes = 0;
    };
    Object.defineProperty(load, "status", {
      get: () => ({
        entries: cache.size,
        estimatedDecodedBytes: decodedBytes,
        maxDecodedBytes,
      }),
    });
    return load;
  }
  scope.PetSequencePlayer = PetSequencePlayer;
  scope.createFrameLoader = createFrameLoader;
  if (typeof module !== "undefined")
    module.exports = { PetSequencePlayer, createFrameLoader };
})(globalThis);
