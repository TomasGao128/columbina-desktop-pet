// All coordinates use the character canvas as a unit; no frame-count-dependent physics.
const DISTANCES = Object.freeze({ near: 1.03, mid: 1.2, far: 1.38 });
const MODES = Object.freeze({
  practice: { seconds: 0 },
  streak: { goal: 5, lives: 3 },
  timed: { seconds: 45 },
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function chargePower(milliseconds) {
  return clamp((Number(milliseconds) || 0) / 1150, 0.02, 1);
}
function requiredPower(distance = "mid", style = "jump") {
  return (
    0.43 +
    (DISTANCES[distance] - 0.78) * 0.24 +
    (style === "layup" ? -0.045 : 0)
  );
}
function positiveRoot(velocity, gravity, distance) {
  return (
    (-velocity + Math.sqrt(velocity * velocity + 2 * gravity * distance)) /
    gravity
  );
}
function launchShot({
  power,
  distance = "mid",
  style = "jump",
  origin = { x: 0.78, y: 0.15 },
  wind = 0,
} = {}) {
  if (!DISTANCES[distance]) distance = "mid";
  power = clamp(Number(power) || 0, 0.02, 1);
  const hoop = { x: DISTANCES[distance], y: 0.29 };
  const gravity = 2.1,
    vy = style === "layup" ? -0.54 : -0.72;
  const hoopTime = positiveRoot(vy, gravity, hoop.y - origin.y);
  const ideal = requiredPower(distance, style);
  const vx =
    ((hoop.x - origin.x) / hoopTime) * (power / ideal) - 0.5 * wind * hoopTime;
  const hitX = origin.x + vx * hoopTime + 0.5 * wind * hoopTime * hoopTime;
  const error = hitX - hoop.x,
    made = Math.abs(error) <= 0.053;
  let boardTime = null;
  // A long shot can hit the vertical backboard and rebound; only descending hits count.
  if (!made && error > 0) {
    const boardX = hoop.x + 0.065;
    for (let t = 0.1; t < hoopTime; t += 0.01) {
      const x = origin.x + vx * t + 0.5 * wind * t * t,
        y = origin.y + vy * t + 0.5 * gravity * t * t;
      if (x >= boardX) {
        if (y >= 0.09 && y <= 0.27) boardTime = t;
        break;
      }
    }
  }
  return Object.freeze({
    power,
    ideal,
    origin: { ...origin },
    hoop,
    gravity,
    vx,
    vy,
    wind,
    hoopTime,
    error,
    made,
    perfect: made && Math.abs(error) < 0.016,
    boardTime,
    distance,
    style,
  });
}
function sampleShot(shot, seconds) {
  let t = Math.max(0, Number(seconds) || 0),
    origin = shot.origin,
    vx = shot.vx,
    vy = shot.vy,
    gravity = shot.gravity,
    wind = shot.wind,
    phase = "flight";
  if (shot.made && t > shot.hoopTime) {
    t -= shot.hoopTime;
    origin = { x: shot.hoop.x + shot.error, y: shot.hoop.y };
    vx = -shot.error * 0.4;
    vy = 0.28;
    wind = 0;
    phase = "net";
  } else if (shot.boardTime !== null && t > shot.boardTime) {
    const bt = shot.boardTime;
    origin = {
      x: shot.origin.x + shot.vx * bt + 0.5 * shot.wind * bt * bt,
      y: shot.origin.y + shot.vy * bt + 0.5 * gravity * bt * bt,
    };
    vx = -shot.vx * 0.52;
    vy = (shot.vy + gravity * bt) * 0.75;
    wind = 0;
    t -= bt;
    phase = "rebound";
  }
  const floor = 0.945;
  const floorTime = positiveRoot(vy, gravity, floor - origin.y);
  if (t <= floorTime)
    return {
      x: origin.x + vx * t + 0.5 * wind * t * t,
      y: origin.y + vy * t + 0.5 * gravity * t * t,
      vx: vx + wind * t,
      vy: vy + gravity * t,
      phase,
      compression: 1,
    };
  let x = origin.x + vx * floorTime + 0.5 * wind * floorTime * floorTime,
    rest = t - floorTime,
    bounceSpeed = (vy + gravity * floorTime) * 0.47,
    slide = (vx + wind * floorTime) * 0.65;
  for (let i = 0; i < 5; i++) {
    const duration = (2 * bounceSpeed) / gravity;
    if (rest <= duration)
      return {
        x: clamp(x + slide * rest, 0.05, 1.47),
        y: floor - bounceSpeed * rest + 0.5 * gravity * rest * rest,
        vx: slide,
        vy: -bounceSpeed + gravity * rest,
        phase: "bounce",
        compression: rest < 0.055 ? 0.83 + (rest / 0.055) * 0.17 : 1,
      };
    rest -= duration;
    x += slide * duration;
    slide *= 0.58;
    bounceSpeed *= 0.47;
  }
  return {
    x: clamp(x + slide * Math.min(rest, 1), 0.05, 1.47),
    y: floor,
    vx: 0,
    vy: 0,
    phase: "rest",
    compression: 1,
  };
}
function createMatch(mode = "practice", now = 0) {
  return {
    mode: MODES[mode] ? mode : "practice",
    started: now,
    shots: 0,
    makes: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    lives: 3,
    lastSettled: 0,
    finished: false,
  };
}
function settleShot(match, shot, id) {
  if (match.finished || id <= match.lastSettled) return false;
  match.lastSettled = id;
  match.shots++;
  if (shot.made) {
    match.makes++;
    match.combo++;
    match.score += (shot.distance === "far" ? 3 : 2) + (shot.perfect ? 1 : 0);
    match.bestCombo = Math.max(match.bestCombo, match.combo);
  } else {
    match.combo = 0;
    if (match.mode === "streak") match.lives--;
  }
  if (match.mode === "streak" && (match.combo >= 5 || match.lives <= 0))
    match.finished = true;
  return true;
}
function updateMatch(match, now) {
  if (match.mode === "timed" && now - match.started >= 45000)
    match.finished = true;
  return match.finished;
}
function shotClock(realSeconds, hoopTime, enabled = false) {
  const start = Math.max(0, hoopTime - 0.12),
    span = 0.24,
    rate = 0.4,
    delay = enabled ? span / rate - span : 0;
  let seconds = Math.max(0, realSeconds),
    slowed = false;
  if (enabled && seconds >= start) {
    if (seconds < start + span / rate) {
      seconds = start + (seconds - start) * rate;
      slowed = true;
    } else seconds -= delay;
  }
  return { seconds, delay, slowed };
}
module.exports = {
  shotClock,
  DISTANCES,
  MODES,
  chargePower,
  requiredPower,
  launchShot,
  sampleShot,
  createMatch,
  settleShot,
  updateMatch,
};
