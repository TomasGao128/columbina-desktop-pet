function makeQuestion(seed) {
  let value = seed >>> 0;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value;
  };
  const a = (random() % 12) + 1,
    b = (random() % 9) + 1,
    type = random() % 3;
  const answer =
    type === 0 ? a + b : type === 1 ? a * b : Math.max(a, b) - Math.min(a, b);
  const expression =
    type === 0
      ? `${a} + ${b}`
      : type === 1
        ? `${a} × ${b}`
        : `${Math.max(a, b)} − ${Math.min(a, b)}`;
  const choices = [answer, answer + 1, answer + 3];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = random() % (i + 1);
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return Object.freeze({ expression, answer, choices: Object.freeze(choices) });
}
function gradeAnswer(question, index) {
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < question.choices.length &&
    question.choices[index] === question.answer
  );
}
function beatPosition(elapsed, period = 1800) {
  return Number.isFinite(elapsed) && elapsed >= 0 && period > 0
    ? (elapsed % period) / period
    : 0;
}
function timingHit(position) {
  return Number.isFinite(position) && position >= 0.4 && position <= 0.6;
}
function shotPoint(progress, made = true) {
  const t = Math.max(0, Math.min(1, Number(progress) || 0)),
    u = 1 - t;
  return {
    x: u * u * 0.39 + 2 * u * t * 0.68 + t * t * (made ? 0.91 : 1.02),
    y: u * u * 0.04 + 2 * u * t * -0.2 + t * t * (made ? 0.27 : 0.39),
  };
}
function dribblePoint(elapsed) {
  return { x: 0.16, y: 0.79 + 0.15 * Math.abs(Math.sin(elapsed / 330)) };
}
module.exports = {
  makeQuestion,
  gradeAnswer,
  beatPosition,
  timingHit,
  shotPoint,
  dribblePoint,
};
