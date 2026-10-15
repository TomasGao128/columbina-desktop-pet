// Use full unmodified sprites; position the body outside the screen while the head leans in.
const EDGE_PEEKS = Object.freeze({
  left: Object.freeze({ frame: "./edge-peek-right.png", boundary: 0.44 }),
  right: Object.freeze({ frame: "./edge-peek-left.png", boundary: 0.48 }),
});
function edgePeekX(side, area, offX) {
  const width = Math.max(0, (offX - 44) * 2);
  return Math.round(
    (side === "left" ? area.x : area.x + area.width) -
      44 -
      width * EDGE_PEEKS[side].boundary,
  );
}
module.exports = { EDGE_PEEKS, edgePeekX };
