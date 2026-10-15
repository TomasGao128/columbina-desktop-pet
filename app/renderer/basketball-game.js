const {
  chargePower,
  requiredPower,
  launchShot,
  sampleShot,
  createMatch,
  settleShot,
  updateMatch,
  DISTANCES,
  shotClock,
} = require("../core/basketball-physics");
function createBasketballGame({
  poses,
  onMessage,
  onReward,
  onChange,
  onResult = () => {},
  slowMotion = () => false,
  reduced = () => false,
  now = () => performance.now(),
}) {
  let match = createMatch("practice", now()),
    phase = "ready",
    distance = "mid",
    style = "jump",
    hand = "right",
    chargeAt = 0,
    started = now(),
    crossAt = -Infinity,
    shotAt = 0,
    shot = null,
    settled = false,
    resultAt = 0,
    replaying = false,
    slowForShot = false,
    lastFlight = 0,
    inSlowMotion = false;
  const anchor = (id) => poses[id].ball;
  function reset(mode = match.mode) {
    match = createMatch(mode, now());
    phase = "ready";
    shot = null;
    replaying = false;
    lastFlight = 0;
    started = now();
    hand = "right";
    onChange();
  }
  function press() {
    if (phase !== "ready" || match.finished) return false;
    chargeAt = now();
    phase = "charging";
    onChange();
    return true;
  }
  function release(explicitPower) {
    if (
      phase !== "charging" &&
      !(phase === "ready" && Number.isFinite(explicitPower))
    )
      return false;
    const power = Number.isFinite(explicitPower)
      ? explicitPower
      : chargePower(now() - chargeAt);
    const origin = { ...anchor(style === "layup" ? "layup" : "shoot") };
    if (style === "layup") origin.x += distance === "near" ? 0.04 : 0.1;
    shot = launchShot({
      power,
      distance,
      style,
      origin,
      wind: match.mode === "timed" ? ((match.shots % 3) - 1) * 0.05 : 0,
    });
    phase = "shot";
    replaying = false;
    slowForShot = slowMotion() && !reduced();
    lastFlight = 0;
    shotAt = now();
    settled = false;
    onChange();
    return true;
  }
  function crossover() {
    if (phase !== "ready") return false;
    hand = hand === "right" ? "left" : "right";
    crossAt = now();
    onMessage(
      hand === "left" ? "换到左手…跟得上吗？" : "再换回来，节奏会更轻快。",
    );
    return true;
  }
  function setDistance(value) {
    if (phase === "shot" || !DISTANCES[value]) return false;
    distance = value;
    onChange();
    return true;
  }
  function setStyle(value) {
    if (phase === "shot" || !["jump", "layup"].includes(value)) return false;
    style = value;
    onChange();
    return true;
  }
  function setMode(value) {
    if (!["practice", "streak", "timed"].includes(value)) return false;
    reset(value);
    return true;
  }
  function next() {
    if (phase !== "result") return false;
    if (match.finished) reset();
    else {
      phase = "ready";
      started = now();
      shot = null;
      onChange();
    }
    return true;
  }
  function state(at = now()) {
    updateMatch(match, at);
    if (match.finished && phase !== "shot" && phase !== "result") {
      phase = "result";
      resultAt = at;
      onChange();
    }
    const elapsed = at - started;
    let pose = "ready",
      ball = { ...anchor("ready"), compression: 1 },
      offset = { x: 0, y: 0 },
      net = 0;
    if (phase === "ready") {
      if (elapsed > 550) {
        const cycle = ((at - started - 550) % 900) / 900;
        pose =
          hand === "left"
            ? "cross"
            : cycle < 0.2 || cycle > 0.85
              ? "dribble-up"
              : cycle < 0.38 || cycle > 0.68
                ? "dribble-mid"
                : "dribble";
        const top = anchor(hand === "left" ? "cross" : "dribble-up");
        const bounce = 4 * cycle * (1 - cycle);
        ball = {
          x: top.x,
          y: top.y + (0.945 - top.y) * bounce,
          compression: Math.abs(cycle - 0.5) < 0.035 ? 0.86 : 1,
        };
        if (at - crossAt < 650) {
          pose = "cross";
          const f = Math.min(1, (at - crossAt) / 650);
          const from = anchor(hand === "left" ? "dribble-up" : "cross"),
            to = anchor(hand === "left" ? "cross" : "dribble-up");
          ball = {
            x: from.x + (to.x - from.x) * f,
            y: 0.7 + 0.2 * Math.sin(f * Math.PI),
            compression: 1,
          };
        }
      }
    } else if (phase === "charging") {
      pose = "crouch";
      ball = { ...anchor("crouch"), compression: 1 };
    } else if (phase === "shot") {
      const age = at - shotAt;
      const shotTime = shotClock(
        Math.max(0, (age - 650) / 1000),
        shot.hoopTime,
        shot.made && slowForShot && !reduced(),
      );
      const flight = Math.max(lastFlight, shotTime.seconds);
      lastFlight = flight;
      inSlowMotion = shotTime.slowed;
      if (style === "layup") {
        pose =
          age < 180
            ? "crouch"
            : age < 440
              ? "layup-step"
              : age < 1050
                ? "layup"
                : age < 1400
                  ? "recover"
                  : "land";
        offset.x = (distance === "near" ? 0.04 : 0.1) * Math.min(1, age / 450);
      } else
        pose =
          age < 120
            ? "crouch"
            : age < 240
              ? "gather"
              : age < 360
                ? "rise"
                : age < 480
                  ? "extend"
                  : age < 650
                    ? "shoot"
                    : age < 1050
                      ? "follow"
                      : age < 1400
                        ? "recover"
                        : "land";
      if (age < 650) ball = { ...anchor(pose), compression: 1 };
      else ball = sampleShot(shot, flight);
      if (style === "layup" && age < 650) ball.x += offset.x;
      if (shot.made && flight > shot.hoopTime && flight < shot.hoopTime + 0.4)
        net = Math.sin(((flight - shot.hoopTime) / 0.4) * Math.PI) * 0.06;
      if (!settled && flight >= shot.hoopTime + 0.18) {
        settled = true;
        const credited = settleShot(match, shot, match.shots + 1);
        onMessage(
          shot.perfect
            ? "空心！这一球很漂亮。"
            : shot.made
              ? `进了！已经连进 ${match.combo} 球。`
              : shot.error < 0
                ? "力度轻了一点…再多蓄一点力。"
                : "力度大了一点…下次轻轻松手。",
        );
        if (credited)
          onResult({ ...match, made: shot.made, perfect: shot.perfect });
        if (shot.made && credited) onReward();
      }
      if (age >= 3300 + shotTime.delay * 1000) {
        phase = "result";
        resultAt = at;
        onChange();
      }
    } else if (phase === "result") {
      pose = shot?.made ? "win" : "miss";
      ball = null;
      if (
        match.mode !== "practice" &&
        !match.finished &&
        at - resultAt > 1100
      ) {
        phase = "ready";
        started = at;
        shot = null;
        distance = match.shots % 3 === 2 ? "far" : "mid";
        onChange();
      }
    }
    return {
      pose,
      ball,
      offset,
      net,
      hoop: { x: DISTANCES[distance], y: 0.29 },
      shot,
      phase,
      combo: match.combo,
      inSlowMotion,
      replaying,
      trail:
        phase === "shot" && at - shotAt > 650 && !reduced()
          ? Array.from({ length: 5 }, (_, i) =>
              sampleShot(shot, Math.max(0, lastFlight - (i + 1) * 0.035)),
            )
          : [],
      burst:
        phase === "result" && shot?.made
          ? Math.max(0, 1 - (at - resultAt) / 1100)
          : 0,
    };
  }
  function cancelCharge() {
    if (phase !== "charging") return false;
    phase = "ready";
    started = now();
    onChange();
    return true;
  }
  function replay() {
    if (phase !== "result" || !shot) return false;
    phase = "shot";
    shotAt = now();
    replaying = true;
    settled = true;
    slowForShot = !reduced();
    lastFlight = 0;
    onMessage("再慢慢看一次这一球…");
    onChange();
    return true;
  }
  return {
    replay,
    press,
    release,
    crossover,
    setDistance,
    setStyle,
    setMode,
    next,
    reset,
    state,
    cancelCharge,
    get snapshot() {
      return {
        ...match,
        phase,
        replaying,
        inSlowMotion,
        distance,
        style,
        hand,
        power: phase === "charging" ? chargePower(now() - chargeAt) : 0,
        ideal: requiredPower(distance, style),
        made: shot?.made ?? null,
        perfect: shot?.perfect ?? false,
        shotAt,
        started,
        secondsLeft:
          match.mode === "timed"
            ? Math.max(0, 45 - (now() - match.started) / 1000)
            : null,
      };
    },
  };
}
module.exports = { createBasketballGame };
