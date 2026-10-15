// User walking drawings: left six / right eight. Running retains six per side.
const userWalk = require('./user-walk-plan.json');
const WALK_FRAME_MS = 220;
const WALK_STEP_MS = 440;
const RUN_FRAME_MS = 150;
const COUNTS = { left: userWalk.left.frames.length, right: userWalk.right.frames.length };
const RUN_COUNTS = { left: 6, right: 6 };
const contacts = require('./reviewed-locomotion-cues.json');
const WALK_LANDING_FRAMES = {
  left: userWalk.left.landingFrames,
  right: userWalk.right.landingFrames,
};
const RUN_LANDING_FRAMES = { left: [1, 4], right: [1, 4] };

function getLandingContact(action, frameIndex) {
  return contacts[action]?.[frameIndex] || null;
}

function getLandingSide(landingFrames, frameIndex) {
  const contactIndex = landingFrames.indexOf(frameIndex);
  if (contactIndex < 0) return null;
  return contactIndex % 2 === 0 ? 'left' : 'right';
}

function buildWalkCycle(direction) {
  if (direction !== 'left' && direction !== 'right') {
    throw new TypeError(`Unknown walk direction: ${direction}`);
  }
  return [...userWalk[direction].frames];
}

function buildRunCycle(direction) {
  if (direction !== 'left' && direction !== 'right')
    throw new TypeError(`Unknown run direction: ${direction}`);
  return Array.from(
    { length: RUN_COUNTS[direction] },
    (_, index) => `./reviewed-run-${direction}-${String(index + 1).padStart(2, '0')}.webp`,
  );
}

module.exports = {
  buildWalkCycle,
  buildRunCycle,
  WALK_FRAME_MS,
  WALK_STEP_MS,
  RUN_FRAME_MS,
  WALK_LANDING_FRAMES,
  RUN_LANDING_FRAMES,
  getLandingSide,
  getLandingContact,
  WALK_COUNTS: COUNTS,
  RUN_COUNTS,
};
