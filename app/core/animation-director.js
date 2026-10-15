// Migration adapter: one body sequence, bounded diagnostics, terminal events exactly once.
function createAnimationDirector({
  player,
  catalog,
  now = () => performance.now(),
}) {
  let active = null,
    token = 0,
    generation = 1,
    disposed = false;
  const history = [],
    listeners = new Set();
  function emit(type, task, reason = null) {
    const event = Object.freeze({
      type,
      actionId: task.id,
      playToken: task.token,
      generation: task.generation,
      atMs: now(),
      reason,
    });
    history.push(event);
    if (history.length > 64) history.shift();
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (_) {
        /* Observers never own playback. */
      }
    }
  }
  function finish(task, type, reason = null) {
    if (active !== task) return false;
    active = null;
    emit(type, task, reason);
    return true;
  }
  function cancel(reason = "cancelled") {
    const task = active;
    active = null;
    player.cancel();
    task?.cleanup?.();
    if (task) emit("action.cancelled", task, reason);
  }
  function canStart(id, { automatic = false } = {}) {
    if (disposed) return { accepted: false, reason: "disposed" };
    const definition = catalog.get(id);
    if (!definition) return { accepted: false, reason: "unsupported" };
    const priority = automatic ? 10 : definition.priority;
    if (active && (priority < active.priority || automatic))
      return { accepted: false, reason: "busy" };
    return { accepted: true, reason: null };
  }
  function play(frames, options = {}) {
    const id = options.actionId ?? "rest";
    const admission = canStart(id, options);
    if (!admission.accepted) return false;
    const definition = catalog.get(id);
    if (frames.some((frame) => !definition.frames.includes(frame))) {
      options.onError?.(
        new Error("Action frame does not belong to catalog: " + id),
      );
      return false;
    }
    cancel("replaced");
    const task = {
      id,
      token: ++token,
      generation,
      priority: options.automatic ? 10 : definition.priority,
      phase: "preparing",
    };
    active = task;
    emit("action.preparing", task);
    return player.play(frames, {
      ...options,
      onFrame(src, index) {
        if (active !== task || task.generation !== generation) return;
        if (task.phase === "preparing") {
          task.phase = "playing";
          emit("action.started", task);
        }
        if (active === task && task.generation === generation)
          options.onFrame?.(src, index);
      },
      onBlend(...args) {
        if (active === task && task.generation === generation)
          options.onBlend?.(...args);
      },
      onDone() {
        if (finish(task, "action.finished")) options.onDone?.();
      },
      onError(error) {
        if (finish(task, "action.failed", error.message))
          options.onError?.(error);
      },
    });
  }
  return {
    play,
    cancel,
    canStart,
    acquire(id, { priority = 70, automatic = false, cleanup = () => {} } = {}) {
      if (disposed || (active && (automatic || priority < active.priority)))
        return null;
      cancel("replaced");
      const task = {
        id,
        token: ++token,
        generation,
        priority,
        phase: "playing",
        cleanup,
      };
      active = task;
      emit("action.started", task);
      return {
        get active() {
          return active === task && task.generation === generation;
        },
        finish() {
          return finish(task, "action.finished");
        },
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    nextGeneration() {
      cancel("generation_changed");
      generation++;
    },
    dispose() {
      cancel("disposed");
      disposed = true;
      listeners.clear();
    },
    get status() {
      return {
        generation,
        active: active
          ? {
              id: active.id,
              token: active.token,
              generation: active.generation,
              priority: active.priority,
              phase: active.phase,
            }
          : null,
        events: [...history],
      };
    },
    // Keep existing diagnostic callers compatible during the migration.
    get version() {
      return player.version;
    },
    get timers() {
      return player.timers;
    },
    get loading() {
      return player.loading;
    },
  };
}
module.exports = { createAnimationDirector };
