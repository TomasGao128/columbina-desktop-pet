const assert = require("node:assert/strict");
const { createActionCatalog } = require("../app/core/action-catalog");
const { createAnimationDirector } = require("../app/core/animation-director");
const { createFrameLoader } = require("../app/renderer/sequence-player");
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS " + name);
}
const posePolicy = require("../app/renderer/companionship");
const poseText = require("../app/renderer/pose-lines.json");
const poseList = require("../app/renderer/user-poses.json");
test("every pose has a nonempty distinct curated text collection", () => {
  assert.equal(Object.keys(poseText).length, poseList.length);
  for (const pose of poseList) {
    const lines = posePolicy.poseLines(pose);
    assert.ok(lines.length >= 1 && lines.length <= 5);
    assert.equal(new Set(lines).size, lines.length);
    assert.ok(
      lines.every(
        (line) =>
          typeof line === "string" && line.length > 0 && line.length <= 40,
      ),
    );
  }
});
test("pose text is selected by identity rather than misleading label keywords", () => {
  assert.deepEqual(
    posePolicy.poseLines({ id: 23, label: "跳舞" }),
    poseText[23],
  );
  assert.ok(poseText[23].some((line) => line.includes("高椅")));
  assert.ok(poseText[28].some((line) => line.includes("掌心")));
});
test("unknown pose gets neutral text without inventing a movement", () => {
  assert.deepEqual(
    posePolicy.poseLines({ id: 999, label: "侧卧起舞" }),
    posePolicy.poseLines(null),
  );
});
test("pose line callers cannot mutate the shared collection", () => {
  const lines = posePolicy.poseLines({ id: 0 });
  lines[0] = "changed";
  assert.notEqual(posePolicy.poseLines({ id: 0 })[0], "changed");
});
test("pose feedback supports single-line pools and avoids repeats when choices exist", () => {
  const picker = require("../app/core/interaction-feel").createFeedbackPicker(
    () => 0,
  );
  for (const pose of poseList) {
    const lines = posePolicy.poseLines(pose);
    const first = picker("pose:" + pose.id, lines);
    const second = picker("pose:" + pose.id, lines);
    if (lines.length > 1) assert.notEqual(first, second);
    else assert.equal(second, lines[0]);
  }
});
const menuFeedback = require("../app/core/menu-feedback");
const menuText = require("../app/renderer/menu-bubbles.json");
test("all 18 actions and 10 moods receive exactly three fresh lines", () => {
  const ids = [
    ...posePolicy.ACTION_ORDER,
    ...[
      "shy",
      "laugh",
      "tongueOut",
      "ignore",
      "wave",
      "cheer",
      "expect",
      "shyCover",
      "coax",
      "sad",
    ].map((id) => "mood:" + id),
  ];
  assert.deepEqual(Object.keys(menuText).sort(), ids.sort());
  for (const id of ids) {
    const lines = menuFeedback.additionalLines(id);
    assert.equal(lines.length, 3);
    assert.equal(new Set(lines).size, 3);
    assert.ok(lines.every((line) => line.trim() && line.length <= 40));
  }
});
test("text-first menu branch selects the fresh pool", () => {
  const result = menuFeedback.chooseMenuFeedback("bow", ["old"], () => 0);
  assert.equal(result.textOnly, true);
  assert.deepEqual(result.lines, menuText.bow);
});
test("original voiced branch and unrelated interactions remain available", () => {
  const base = ["old"];
  assert.deepEqual(
    menuFeedback.chooseMenuFeedback("bow", base, () => 0.99),
    { textOnly: false, lines: base },
  );
  for (const id of [
    "pose:23",
    "touch-head",
    "touch-chest",
    "touch-foot",
    "unknown",
  ])
    assert.deepEqual(
      menuFeedback.chooseMenuFeedback(id, base, () => 0),
      { textOnly: false, lines: base },
    );
});
test("menu line callers cannot mutate shared text", () => {
  const lines = menuFeedback.additionalLines("mood:shy");
  lines[0] = "changed";
  assert.notEqual(menuFeedback.additionalLines("mood:shy")[0], "changed");
});
const frame = "./one.webp";
const catalog = createActionCatalog({
  clips: { "touch-head": { frames: [frame] }, bow: { frames: [frame] } },
  companions: Object.fromEntries(
    ["cake", "badminton", "ball", "sing", "pinch", "feather", "shoulder"].map(
      (id) => [id, { frames: [frame] }],
    ),
  ),
  poses: [{ id: 0, frame, holdMs: 7200 }],
  moods: {},
  locomotion: {},
  sleepPoses: [frame],
});
test("touch voice is disabled in local policy", () =>
  assert.equal(catalog.get("touch-head").voice, false));
test("other voice remains enabled", () =>
  assert.equal(catalog.get("game:sing").voice, true));
test("catalog rejects unsafe resource paths", () =>
  assert.throws(() =>
    createActionCatalog({ clips: { bad: { frames: ["../bad.png"] } } }),
  ));
test("catalog rejects inconsistent frame timing", () =>
  assert.throws(() =>
    createActionCatalog({
      clips: { bad: { frames: [frame], frameDurations: [] } },
    }),
  ));
test("catalog frames cannot be modified", () =>
  assert.throws(() => catalog.get("bow").frames.push(frame)));

let callbacks;
const fake = {
  version: 0,
  timers: [],
  loading: null,
  play(frames, options) {
    callbacks = options;
    return Promise.resolve();
  },
  cancel() {
    this.version++;
  },
};
const director = createAnimationDirector({
  player: fake,
  catalog,
  now: () => 100,
});
test("unsupported request is rejected", () =>
  assert.equal(director.canStart("missing").reason, "unsupported"));
director.play([frame], { actionId: "bow" });
const previous = callbacks;
test("loading owns one preparing task", () =>
  assert.equal(director.status.active.phase, "preparing"));
test("lower priority touch cannot preempt menu action", () =>
  assert.equal(director.canStart("touch-head").reason, "busy"));
test("automatic action cannot preempt user action", () =>
  assert.equal(director.canStart("bow", { automatic: true }).reason, "busy"));
callbacks.onFrame(frame, 0);
test("first visible frame starts lifecycle once", () => {
  callbacks.onFrame(frame, 0);
  assert.equal(
    director.status.events.filter((e) => e.type === "action.started").length,
    1,
  );
});
director.cancel("drag");
director.play([frame], { actionId: "game:sing" });
previous.onDone();
previous.onError(new Error("stale"));
previous.onFrame(frame, 0);
test("stale callbacks cannot overwrite new owner", () =>
  assert.equal(director.status.active.id, "game:sing"));
let completed = 0;
director.cancel();
director.play([frame], { actionId: "bow", onDone: () => completed++ });
callbacks.onFrame(frame, 0);
callbacks.onDone();
callbacks.onDone();
test("natural completion is emitted once", () => assert.equal(completed, 1));
director.play([frame], { actionId: "bow" });
const oldGeneration = callbacks;
director.nextGeneration();
oldGeneration.onDone();
test("generation change cancels old playback", () => {
  assert.equal(director.status.generation, 2);
  assert.equal(director.status.active, null);
});
director.play([frame], { actionId: "bow" });
callbacks.onError(new Error("missing image"));
test("loading errors release owner", () => {
  assert.equal(director.status.active, null);
  assert.equal(director.status.events.at(-1).type, "action.failed");
});
for (let i = 0; i < 40; i++) {
  director.play([frame], { actionId: "bow" });
  director.cancel();
}
test("diagnostic history is bounded", () =>
  assert.equal(director.status.events.length, 64));
director.dispose();
test("disposed director rejects new work", () =>
  assert.equal(director.canStart("bow").reason, "disposed"));

class FakeImage {
  naturalWidth = 2;
  naturalHeight = 2;
  set src(value) {
    this.value = value;
    if (value) queueMicrotask(() => this.onload?.());
  }
  decode() {
    return Promise.resolve();
  }
}
(async () => {
  const load = createFrameLoader(FakeImage, { maxDecodedBytes: 32 });
  await load(["a", "b"]);
  await load(["a"]);
  await load(["c"]);
  test("decoded image cache stays inside its budget", () => {
    assert.equal(load.status.entries, 2);
    assert.equal(load.status.estimatedDecodedBytes, 32);
  });
  const instances = [];
  class CountingImage extends FakeImage {
    constructor() {
      super();
      instances.push(this);
    }
  }
  const lru = createFrameLoader(CountingImage, { maxDecodedBytes: 32 });
  await lru(["a", "b"]);
  await lru(["a"]);
  await lru(["c"]);
  await lru(["a"]);
  test("recently used image remains cached", () =>
    assert.equal(instances.length, 3));
  await lru(["b"]);
  test("least recently used image reloads", () =>
    assert.equal(instances.length, 4));
  load.clear();
  test("cache clears accounting on unload", () =>
    assert.equal(load.status.estimatedDecodedBytes, 0));
  const { bodyHit } = require("../app/core/body-hit");
  const { recoverPosition, walkBounds } = require("../app/core/display-layout");
  const mask = {
    size: 2,
    pixels: [0, 255, 255, 0],
    cx: 0,
    cy: 0,
    width: 100,
    height: 100,
    angle: 0,
  };
  test("transparent sprite region passes through", () =>
    assert.equal(bodyHit(mask, -25, -25), false));
  test("opaque sprite region owns input", () =>
    assert.equal(bodyHit(mask, 25, -25), true));
  test("outside sprite does not own input", () =>
    assert.equal(bodyHit(mask, 90, 0), false));
  test("rotated hit geometry follows sprite", () =>
    assert.equal(bodyHit({ ...mask, angle: Math.PI / 2 }, 25, 25), true));
  test("missing mask fails closed", () =>
    assert.equal(bodyHit(null, 0, 0), false));
  const area = { x: -1920, y: -200, width: 1920, height: 1080 };
  test("saved secondary display position survives", () =>
    assert.deepEqual(
      recoverPosition({ x: -1500, y: 0, width: 400, height: 450 }, area),
      { x: -1500, y: 0 },
    ));
  test("disconnected display position is reachable", () =>
    assert.deepEqual(
      recoverPosition({ x: 5000, y: 5000, width: 400, height: 450 }, area),
      { x: -120, y: 430 },
    ));
  test("walk bounds use secondary origin", () =>
    assert.deepEqual(walkBounds(area, 200, 400), { minX: -2120, maxX: -400 }));
  const owner = createAnimationDirector({ player: { cancel() {} }, catalog });
  let cleaned = 0;
  const lease = owner.acquire("dizzy", {
    priority: 80,
    cleanup: () => cleaned++,
  });
  test("external action owns unified director", () =>
    assert.equal(owner.status.active.id, "dizzy"));
  test("automatic owner cannot interrupt dizzy", () =>
    assert.equal(
      owner.acquire("walk-left", { automatic: true, priority: 10 }),
      null,
    ));
  owner.cancel();
  owner.cancel();
  test("external owner cleanup runs once", () => {
    assert.equal(cleaned, 1);
    assert.equal(lease.active, false);
  });
  const { PetSequencePlayer } = require("../app/renderer/sequence-player");
  let clock = 0,
    pending = [],
    rendered = [],
    done = 0;
  const sequence = new PetSequencePlayer({
    prepare: async () => {},
    render: (src) => rendered.push(src),
    now: () => clock,
    schedule: (fn) => {
      pending.push(fn);
      return fn;
    },
    unschedule: (fn) => {
      pending = pending.filter((x) => x !== fn);
    },
  });
  await sequence.play(["a", "b", "c", "d"], {
    frameMs: 100,
    holdMs: 100,
    onDone: () => done++,
  });
  test("playback keeps one pending timer", () =>
    assert.equal(pending.length, 1));
  clock = 250;
  pending.shift()();
  test("late clock skips expired frames", () =>
    assert.deepEqual(rendered, ["a", "c"]));
  clock = 500;
  pending.shift()();
  test("late completion runs once without backlog", () => {
    assert.equal(done, 1);
    assert.equal(pending.length, 0);
  });
  const {
    makeQuestion,
    gradeAnswer,
    beatPosition,
    timingHit,
    shotPoint,
    dribblePoint,
  } = require("../app/core/playroom-policy");
  test("quiz seeds produce deterministic questions", () =>
    assert.deepEqual(makeQuestion(123), makeQuestion(123)));
  test("quiz choices contain exactly one correct answer", () => {
    for (let seed = 0; seed < 200; seed++) {
      const q = makeQuestion(seed);
      assert.equal(q.choices.filter((v) => v === q.answer).length, 1);
      assert.equal(new Set(q.choices).size, 3);
    }
  });
  const q = makeQuestion(81);
  test("quiz correct selection passes grading", () =>
    assert.equal(gradeAnswer(q, q.choices.indexOf(q.answer)), true));
  test("quiz rejects invalid answer indices", () => {
    for (const i of [-1, 3, NaN, 0.5]) assert.equal(gradeAnswer(q, i), false);
  });
  test("beat clock wraps without delayed timer accumulation", () =>
    assert.equal(beatPosition(4500), 0.5));
  test("timing window distinguishes hit and miss", () => {
    assert.equal(timingHit(0.5), true);
    assert.equal(timingHit(0.2), false);
    assert.equal(timingHit(NaN), false);
  });
  test("made shot ends at hoop center", () =>
    assert.deepEqual(shotPoint(1, true), { x: 0.91, y: 0.27 }));
  test("missed shot does not end at hoop", () =>
    assert.notDeepEqual(shotPoint(1, false), shotPoint(1, true)));
  test("shot arc rises before descending", () =>
    assert.ok(shotPoint(0.4).y < shotPoint(0).y));
  test("dribble stays between hand and floor", () => {
    for (let ms = 0; ms < 5000; ms += 37) {
      const p = dribblePoint(ms);
      assert.ok(p.y >= 0.79 && p.y <= 0.94);
    }
  });

  const physics = require("../app/core/basketball-physics");
  const activity = require("../app/renderer/playroom-assets.json");
  const { createBasketballGame } = require("../app/renderer/basketball-game");
  test("power follows held milliseconds and clamps safely", () => {
    assert.equal(physics.chargePower(575), 0.5);
    assert.equal(physics.chargePower(5000), 1);
    assert.equal(physics.chargePower(-20), 0.02);
  });
  for (const distance of ["near", "mid", "far"])
    for (const style of ["jump", "layup"]) {
      test(
        distance + " " + style + " goes forward and enters hoop at ideal power",
        () => {
          const origin = {
            ...activity.basketball.poses[style === "jump" ? "shoot" : "layup"]
              .ball,
          };
          if (style === "layup") origin.x += distance === "near" ? 0.04 : 0.1;
          const shot = physics.launchShot({
            power: physics.requiredPower(distance, style),
            origin,
            distance,
            style,
          });
          assert.ok(shot.vx > 0);
          assert.ok(shot.perfect);
          assert.ok(
            Math.abs(physics.sampleShot(shot, shot.hoopTime).x - shot.hoop.x) <
              0.0001,
          );
        },
      );
    }
  test("low and high power miss without scripted success", () => {
    for (const power of [0.05, 0.95])
      assert.equal(physics.launchShot({ power }).made, false);
  });
  test("missed ball bounces and settles above ground without timers", () => {
    const shot = physics.launchShot({ power: 0.05 });
    let bounced = false;
    for (let t = 0; t < 8; t += 0.03) {
      const p = physics.sampleShot(shot, t);
      assert.ok(Number.isFinite(p.x) && p.y <= 0.94501);
      bounced ||= p.phase === "bounce";
    }
    assert.ok(bounced);
    assert.equal(physics.sampleShot(shot, 15).phase, "rest");
  });
  test("net crossing remains continuous", () => {
    const shot = physics.launchShot({
      power: physics.requiredPower(),
      origin: { x: 0.9, y: 0.1 },
    });
    const a = physics.sampleShot(shot, shot.hoopTime),
      b = physics.sampleShot(shot, shot.hoopTime + 0.0001);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.001);
  });
  test("backboard rebound occurs at board plane", () => {
    let collision = false;
    for (let power = 0.55; power < 1; power += 0.005) {
      const shot = physics.launchShot({ power });
      if (shot.boardTime !== null) {
        const p = physics.sampleShot(shot, shot.boardTime);
        assert.ok(Math.abs(p.x - shot.hoop.x - 0.065) < 0.03);
        assert.equal(
          physics.sampleShot(shot, shot.boardTime + 0.01).phase,
          "rebound",
        );
        collision = true;
      }
    }
    assert.ok(collision);
  });
  test("five consecutive goals finish streak mode", () => {
    const match = physics.createMatch("streak");
    for (let i = 1; i <= 5; i++)
      physics.settleShot(
        match,
        { made: true, perfect: true, distance: "far" },
        i,
      );
    assert.equal(match.finished, true);
    assert.equal(match.score, 20);
    assert.equal(match.bestCombo, 5);
  });
  test("three misses finish streak without negative lives", () => {
    const m = physics.createMatch("streak");
    for (let i = 1; i <= 5; i++) physics.settleShot(m, { made: false }, i);
    assert.equal(m.lives, 0);
    assert.equal(m.shots, 3);
  });
  test("settlement cannot reward the same shot twice", () => {
    const m = physics.createMatch();
    assert.ok(physics.settleShot(m, { made: true, distance: "mid" }, 1));
    assert.equal(physics.settleShot(m, { made: true }, 1), false);
    assert.equal(m.makes, 1);
  });
  test("timed mode ends at 45 seconds and rejects late scores", () => {
    const m = physics.createMatch("timed", 100);
    assert.equal(physics.updateMatch(m, 45099), false);
    assert.equal(physics.updateMatch(m, 45100), true);
    assert.equal(physics.settleShot(m, { made: true }, 1), false);
  });
  test("practice stays open without arbitrary timeout", () => {
    assert.equal(physics.updateMatch(physics.createMatch(), 10000000), false);
  });
  let basketClock = 0,
    rewards = 0;
  const game = createBasketballGame({
    poses: activity.basketball.poses,
    now: () => basketClock,
    onChange: () => {},
    onMessage: () => {},
    onReward: () => rewards++,
  });
  test("held charge has cancellable lifecycle", () => {
    assert.ok(game.press());
    basketClock = 200;
    assert.equal(game.snapshot.phase, "charging");
    assert.ok(game.cancelCharge());
    assert.equal(game.snapshot.phase, "ready");
    assert.equal(game.release(), false);
  });
  test("shot traverses crouch rise release follow land and result", () => {
    game.release(game.snapshot.ideal);
    const start = basketClock;
    for (const [age, pose] of [
      [0, "crouch"],
      [250, "rise"],
      [420, "extend"],
      [530, "shoot"],
      [800, "follow"],
      [1200, "recover"],
      [1500, "land"],
    ]) {
      basketClock = start + age;
      assert.equal(game.state().pose, pose);
    }
    basketClock = start + 3400;
    game.state();
    assert.equal(game.snapshot.phase, "result");
    assert.equal(rewards, 1);
    game.state();
    assert.equal(rewards, 1);
  });
  test("crossover swaps hands only when ready", () => {
    assert.equal(game.crossover(), false);
    game.next();
    assert.ok(game.crossover());
    assert.equal(game.snapshot.hand, "left");
  });
  test("near layup keeps origin behind the hoop", () => {
    game.setDistance("near");
    game.setStyle("layup");
    game.release(game.snapshot.ideal);
    basketClock += 650;
    const state = game.state();
    assert.ok(state.shot.origin.x < state.hoop.x);
    assert.ok(state.shot.vx > 0);
  });
  test("all used activity files are local and registered", () => {
    const fs = require("node:fs");
    for (const cfg of Object.values(activity))
      for (const file of [...cfg.frames, ...Object.values(cfg.props || {})])
        assert.ok(
          fs.existsSync(
            require("node:path").join(__dirname, "../app/renderer", file),
          ),
        );
    assert.equal(activity.basketball.frames.length, 17);
  });

  const memory = require("../app/core/emotion-memory"),
    schema = require("../app/settings-schema");
  test("new memory defaults stay backward compatible", () => {
    assert.ok(memory.validRecords(memory.emptyRecords()));
    assert.ok(
      memory.validEmotion(memory.createEmotionMemory(null, 100).snapshot),
    );
  });
  test("two losses create determined mood", () => {
    const m = memory.createEmotionMemory(null, 100);
    m.event("miss", {}, 200);
    assert.equal(m.snapshot.mood, "calm");
    m.event("miss", {}, 300);
    assert.equal(m.snapshot.mood, "determined");
  });
  test("repeated wins or a combo create happiness", () => {
    const m = memory.createEmotionMemory(null, 100);
    m.event("win", { combo: 2 }, 200);
    assert.equal(m.snapshot.mood, "happy");
  });
  test("comfort resets frustration", () => {
    const m = memory.createEmotionMemory(null, 100);
    m.event("miss", {}, 200);
    m.event("miss", {}, 300);
    m.event("comfort", {}, 400);
    assert.equal(m.snapshot.mood, "comforted");
    assert.equal(m.snapshot.losses, 0);
  });
  test("lack of interaction for eight minutes creates missing-you mood", () => {
    const m = memory.createEmotionMemory(null, 100);
    assert.equal(m.tick(100 + 8 * 60000), true);
    assert.equal(m.snapshot.mood, "lonely");
    m.event("care", {}, 100 + 8 * 60000 + 1);
    assert.equal(m.snapshot.mood, "comforted");
  });
  test("emotions gently expire without erasing companionship", () => {
    const m = memory.createEmotionMemory(null, 100);
    m.event("company", {}, 200);
    m.tick(200 + 3 * 60000);
    assert.equal(m.snapshot.mood, "calm");
  });
  test("saved emotion survives reopen", () => {
    const m = memory.createEmotionMemory(null, 100);
    m.event("comfort", {}, 200);
    assert.equal(
      memory.createEmotionMemory(m.snapshot, 250).snapshot.mood,
      "comforted",
    );
  });
  test("malformed emotion data is rejected", () => {
    for (const bad of [
      null,
      { mood: "evil" },
      { ...memory.createEmotionMemory(null, 100).snapshot, wins: -1 },
      { ...memory.createEmotionMemory(null, 100).snapshot, until: Infinity },
    ])
      assert.equal(schema.isValid("emotionMemory", bad), false);
  });
  test("best scores cannot decrease or mutate saved data", () => {
    const old = memory.emptyRecords(),
      next = memory.updateRecords(old, "basketball", {
        mode: "timed",
        score: 20,
        bestCombo: 4,
      });
    assert.equal(next.timed, 20);
    assert.equal(next.combo, 4);
    assert.equal(old.timed, 0);
    assert.equal(
      memory.updateRecords(next, "basketball", {
        mode: "timed",
        score: 2,
        bestCombo: 1,
      }).timed,
      20,
    );
  });
  test("rhythm score is separate from basketball modes", () => {
    const m = memory.updateRecords(memory.emptyRecords(), "gaming", {
      score: 5,
    });
    assert.equal(m.rhythm, 5);
    assert.equal(m.practice, 0);
  });
  test("record schema rejects unknown fields and fractional values", () => {
    assert.equal(
      schema.isValid("playRecords", { ...memory.emptyRecords(), oops: 1 }),
      false,
    );
    assert.equal(
      schema.isValid("playRecords", { ...memory.emptyRecords(), rhythm: 1.5 }),
      false,
    );
  });
  test("settings preserve independent validated copies of new data", () => {
    const data = {
        playRecords: memory.emptyRecords(),
        emotionMemory: memory.createEmotionMemory(null, 100).snapshot,
        basketSlowMotion: false,
      },
      out = schema.sanitize(data);
    assert.ok(out.playRecords !== data.playRecords);
    assert.ok(out.emotionMemory !== data.emotionMemory);
    assert.equal(out.basketSlowMotion, false);
  });
  test("slow-motion clock remains continuous at entry and exit", () => {
    const hoop = 1,
      start = 0.88,
      end = start + 0.24 / 0.4;
    for (const t of [start, end]) {
      const a = physics.shotClock(t - 0.00001, hoop, true),
        b = physics.shotClock(t + 0.00001, hoop, true);
      assert.ok(b.seconds >= a.seconds && b.seconds - a.seconds < 0.00003);
    }
    assert.equal(physics.shotClock(2, hoop, false).seconds, 2);
  });
  test("slow-motion never alters physical shot result", () => {
    const shot = physics.launchShot({ power: physics.requiredPower() });
    for (let real = 0; real < 3; real += 0.01) {
      const p = physics.sampleShot(
        shot,
        physics.shotClock(real, shot.hoopTime, true).seconds,
      );
      assert.ok(Number.isFinite(p.y));
    }
    assert.ok(shot.made);
  });
  let sceneClock = 0,
    sceneRewards = 0;
  const scene = require("../app/renderer/scene-game").createSceneGame({
    kind: "cat",
    now: () => sceneClock,
    onMessage: () => {},
    onCare: () => {},
    onReward: () => sceneRewards++,
    onChange: () => {},
  });
  test("cat scene rejects spam and unknown interactions", () => {
    assert.equal(scene.interact("bad"), false);
    assert.ok(scene.interact("pet"));
    assert.equal(scene.interact("pet"), false);
    assert.equal(scene.snapshot.joy, 1);
  });
  test("cat scene changes petting and feather poses", () => {
    assert.equal(scene.state().pose, "stroke");
    sceneClock = 900;
    scene.interact("lure");
    assert.equal(scene.state().pose, "look");
    assert.equal(scene.state().kitten, "play");
  });
  test("cat affection rewards have a separate cooldown", () => {
    sceneClock = 1800;
    scene.interact("pet");
    assert.equal(sceneRewards, 1);
    sceneClock = 2700;
    scene.interact("pet");
    assert.equal(sceneRewards, 1);
  });
  test("scene reactions finish without a timer backlog", () => {
    sceneClock = 6000;
    assert.equal(scene.state().phase, "idle");
    assert.equal(scene.state().pose, "idle");
  });
  test("scenery switches day/night and respects reduced motion", () => {
    const s = require("../app/renderer/scene-game").createSceneGame({
      kind: "scenery",
      now: () => sceneClock,
      onMessage: () => {},
      onCare: () => {},
      onReward: () => {},
      onChange: () => {},
    });
    s.interact("time");
    assert.equal(s.snapshot.time, "dusk");
    assert.equal(s.state(sceneClock + 1000, true).pose, "idle");
  });
  test("replay cannot earn scores or rewards twice", () => {
    let t = 0,
      credits = 0,
      rewards = 0;
    const g = createBasketballGame({
      poses: activity.basketball.poses,
      now: () => t,
      onChange: () => {},
      onMessage: () => {},
      onResult: () => credits++,
      onReward: () => rewards++,
    });
    g.release(g.snapshot.ideal);
    t = 4000;
    g.state();
    assert.equal(credits, 1);
    assert.ok(g.replay());
    t += 4000;
    g.state();
    assert.equal(credits, 1);
    assert.equal(rewards, 1);
    assert.equal(g.snapshot.shots, 1);
  });
  test("a RAF timestamp before scene startup still produces a valid pose", () => {
    const s = require("../app/renderer/scene-game").createSceneGame({
      kind: "scenery",
      now: () => 100,
      onMessage: () => {},
      onCare: () => {},
      onReward: () => {},
      onChange: () => {},
    });
    assert.equal(s.state(90).pose, "stargaze");
    assert.equal(s.state(90).elapsed, 0);
  });

  const { sceneFrame } = require("../app/core/scene-animation");
  test("complete scene frames traverse all six poses and loop", () => {
    for (let index = 0; index < 6; index++)
      assert.equal(sceneFrame(index * 260).index, index);
    assert.equal(sceneFrame(1560).index, 0);
    assert.equal(sceneFrame(1559).index, 5);
  });
  test("full-frame selection remains valid and skips late frames", () => {
    for (let t = 0; t < 10000; t += 16) {
      const f = sceneFrame(t);
      assert.ok(f.index >= 0 && f.index < 6);
    }
    assert.equal(sceneFrame(1300).index, 5);
    assert.equal(sceneFrame(-100).index, 0);
    assert.equal(sceneFrame(NaN).index, 0);
    assert.throws(() => sceneFrame(0, { count: 0 }));
  });
  test("reduced motion holds one complete neutral frame", () => {
    for (const t of [0, 1200, 99999])
      assert.deepEqual(sceneFrame(t, { reduced: true }), { index: 0 });
  });
  test("cat holding persists beyond the short reaction period", () => {
    let at = 0;
    const c = require("../app/renderer/scene-game").createSceneGame({
      kind: "cat",
      now: () => at,
      onMessage: () => {},
      onCare: () => {},
      onReward: () => {},
      onChange: () => {},
    });
    assert.equal(c.interact("release"), false);
    c.interact("hug");
    assert.equal(c.state().pose, "lift");
    at = 700;
    assert.equal(c.state().pose, "hug");
    at = 10000;
    assert.equal(c.state().pose, "hug");
    assert.ok(c.state().embedded);
  });
  test("cuddle and lap each select a real composite pose", () => {
    let at = 0;
    const c = require("../app/renderer/scene-game").createSceneGame({
      kind: "cat",
      now: () => at,
      onMessage: () => {},
      onCare: () => {},
      onReward: () => {},
      onChange: () => {},
    });
    c.interact("hug");
    at = 1000;
    c.interact("cuddle");
    assert.equal(c.state().pose, "nuzzle");
    at = 2000;
    c.interact("lap");
    assert.equal(c.state().pose, "lap");
    assert.ok(c.state().embedded);
  });
  test("put-down hides the floor cat until the attached cat is released", () => {
    let at = 0;
    const c = require("../app/renderer/scene-game").createSceneGame({
      kind: "cat",
      now: () => at,
      onMessage: () => {},
      onCare: () => {},
      onReward: () => {},
      onChange: () => {},
    });
    c.interact("hug");
    at = 1000;
    c.interact("release");
    assert.equal(c.state().pose, "lower");
    assert.ok(c.state().embedded);
    at = 1800;
    assert.equal(c.state().embedded, false);
    assert.equal(c.snapshot.holding, false);
  });
  test("chase has matching travel direction and cat image", () => {
    let at = 0;
    const c = require("../app/renderer/scene-game").createSceneGame({
      kind: "cat",
      now: () => at,
      onMessage: () => {},
      onCare: () => {},
      onReward: () => {},
      onChange: () => {},
    });
    c.interact("chase");
    at = 600;
    const a = c.state();
    assert.equal(a.kitten, "run-right");
    assert.ok(a.kittenPlacement.x > 0.8);
    at = 1800;
    assert.equal(c.state().kitten, "run-left");
  });
  test("themes have distinct times and character states", () => {
    const c = require("../app/renderer/scene-game").createSceneGame({
      kind: "scenery",
      now: () => 0,
      onMessage: () => {},
      onCare: () => {},
      onReward: () => {},
      onChange: () => {},
    });
    for (const [id, time, pose] of [
      ["lake", "dusk", "idle"],
      ["stars", "night", "stargaze"],
      ["garden", "day", "breeze"],
    ]) {
      assert.ok(c.selectTheme(id));
      assert.equal(c.state(0, true).pose, pose);
      assert.equal(c.snapshot.time, time);
    }
    assert.equal(c.selectTheme("invalid"), false);
  });
  console.log("CORE_RESULT " + JSON.stringify({ checks, failed: 0 }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
