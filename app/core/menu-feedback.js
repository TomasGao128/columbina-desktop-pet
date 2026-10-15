// Manual menu feedback mixes fresh text with the existing voiced branch.
const extra = require("../renderer/menu-bubbles.json");
function additionalLines(id) {
  return Object.hasOwn(extra, id) ? [...extra[id]] : [];
}
function chooseMenuFeedback(id, original, random = Math.random) {
  const lines = additionalLines(id);
  const textOnly = lines.length > 0 && random() < 0.6;
  return { textOnly, lines: textOnly ? lines : original };
}
module.exports = { additionalLines, chooseMenuFeedback };
