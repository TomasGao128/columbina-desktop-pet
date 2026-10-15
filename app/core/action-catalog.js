// Local definitions are authoritative; callers cannot supply priority or voice policy.
function createActionCatalog({
  clips,
  companions,
  poses,
  moods,
  locomotion,
  sleepPoses,
  activities = {},
  cosers = [],
}) {
  const entries = new Map();
  function add(id, config, kind) {
    if (entries.has(id)) throw new Error("Duplicate action: " + id);
    const frames = [...config.frames];
    if (
      !frames.length ||
      frames.some((f) => !/^\.\/[\w/-]+\.(webp|png)$/.test(f))
    )
      throw new Error("Invalid local action frames: " + id);
    const durations = config.frameDurations ? [...config.frameDurations] : null;
    if (
      durations &&
      (durations.length !== frames.length ||
        durations.some((ms) => !Number.isFinite(ms) || ms < 20 || ms > 10000))
    )
      throw new Error("Invalid action timing: " + id);
    entries.set(
      id,
      Object.freeze({
        id,
        kind,
        backend: "png",
        frames: Object.freeze(frames),
        frameDurations: durations ? Object.freeze(durations) : null,
        frameMs: config.frameMs ?? 280,
        holdMs: config.holdMs ?? 800,
        priority: kind === "touch" ? 60 : kind === "rest" ? 10 : 70,
        voice: kind !== "touch" && kind !== "coser",
        canInterrupt: true,
      }),
    );
  }
  for (const [id, clip] of Object.entries(clips))
    add(id, clip, id.startsWith("touch-") ? "touch" : "action");
  for (const id of [
    "cake",
    "badminton",
    "ball",
    "sing",
    "pinch",
    "feather",
    "shoulder",
  ])
    add("game:" + id, companions[id], "game");
  for (const pose of poses)
    add(
      "pose:" + pose.id,
      { frames: [pose.frame], holdMs: pose.holdMs },
      "pose",
    );
  for (const pose of cosers)
    add("coser:" + pose.id, { frames: [pose.frame], holdMs: 7200 }, "coser");
  for (const [id, mood] of Object.entries(moods))
    add("mood:" + id, { frames: [mood.file], holdMs: 3600 }, "mood");
  for (const [id, cfg] of Object.entries(locomotion)) add(id, cfg, "action");
  add("rest", { frames: sleepPoses, holdMs: 18000 }, "rest");
  for (const [id, cfg] of Object.entries(activities))
    add("activity:" + id, cfg, "game");
  return Object.freeze({
    get: (id) => entries.get(id) ?? null,
    has: (id) => entries.has(id),
    list: () => [...entries.values()],
    get size() {
      return entries.size;
    },
  });
}
module.exports = { createActionCatalog };
