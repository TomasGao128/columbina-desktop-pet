const { sceneFrame } = require("../core/scene-animation");
const THEMES = Object.freeze({
  lake: {
    label: "湖畔夕阳",
    time: "dusk",
    pose: "idle",
    text: "湖面把夕阳留住了…想和你多看一会儿。",
  },
  stars: {
    label: "星空夜景",
    time: "night",
    pose: "stargaze",
    text: "那颗最亮的星星…你也看到了吗？",
  },
  garden: {
    label: "樱花庭院",
    time: "day",
    pose: "breeze",
    text: "花瓣落得很慢…连心情也变轻了。",
  },
});
function createSceneGame({
  kind,
  now = () => performance.now(),
  onMessage,
  onCare,
  onReward,
  onChange,
}) {
  const started = now();
  let phase = "idle",
    action = "idle",
    actionAt = -Infinity,
    lastInteraction = -Infinity,
    interactions = 0,
    joy = 0,
    theme = "stars",
    rewardAt = -Infinity,
    holding = false,
    lap = false,
    liftNeeded = false,
    puttingDown = false;
  const actions =
    kind === "cat"
      ? [
          "pet",
          "lure",
          "watch",
          "headpat",
          "comfort",
          "hug",
          "cuddle",
          "lap",
          "release",
          "chase",
          "roll",
          "stretch",
          "nap",
        ]
      : ["company", "breeze", "time", "headpat", "comfort", "feet"];
  function selectTheme(id) {
    if (kind !== "scenery" || !THEMES[id]) return false;
    theme = id;
    action = "company";
    actionAt = now();
    phase = "reacting";
    onCare("company");
    onMessage(THEMES[id].text);
    onChange();
    return true;
  }
  function interact(value) {
    const at = now();
    if (!actions.includes(value) || at - lastInteraction < 800) return false;
    if (value === "release" && !holding) return false;
    const wasHeld = holding;
    liftNeeded = false;
    puttingDown = false;
    lastInteraction = at;
    interactions++;
    action = value;
    actionAt = at;
    phase = "reacting";
    if (value === "time")
      theme =
        theme === "stars" ? "lake" : theme === "lake" ? "garden" : "stars";
    if (kind === "cat") {
      if (["hug", "cuddle", "lap"].includes(value)) {
        liftNeeded = !wasHeld;
        holding = true;
        lap = value === "lap";
      }
      if (
        ["release", "chase", "roll", "stretch", "nap", "lure"].includes(value)
      ) {
        puttingDown = wasHeld;
        holding = false;
        lap = false;
      }
      if (
        ["pet", "lure", "hug", "cuddle", "lap", "chase", "roll"].includes(value)
      )
        joy = Math.min(5, joy + 1);
    }
    const messages = {
      pet: holding
        ? "它在怀里蹭了蹭…好暖。"
        : joy >= 4
          ? "小黑都不想离开我们的手了…"
          : "它在蹭我的手…你也来摸摸它吧。",
      lure: "看它扑过来了！这片羽毛好像很受欢迎。",
      watch: "嘘…听，它正在轻轻呼噜。",
      hug: "抱住了…小黑轻轻把爪子搭在我手上。",
      cuddle: "它把脸贴过来了…这一点温暖，也分给你。",
      lap: "坐在膝上就不肯走了…那就一起休息吧。",
      release: "慢慢放下来…去玩一会儿，待会儿再抱你。",
      chase: "小黑在追着自己的影子跑…尾巴也跟着摆。",
      roll: "它翻过来了！小爪子都举起来了。",
      stretch: "伸个懒腰…看，小黑也需要活动一下。",
      nap: "小黑蜷起来了…我们轻轻陪着它。",
      company: THEMES[theme].text,
      breeze:
        theme === "garden"
          ? "风把花瓣带过来了…有一片停在发梢。"
          : "风轻轻掠过水面和发梢…今天很舒服。",
      time: THEMES[theme].text,
      headpat: "你的手很温暖…我会记住的。",
      comfort: "刚才还有一点不服气…现在，想慢慢再试一次。",
      feet: "慢慢摆摆脚…再陪我坐一会儿吧。",
    };
    onCare(
      ["comfort", "headpat"].includes(value)
        ? value
        : kind === "cat"
          ? "cat"
          : "company",
    );
    onMessage(messages[value]);
    onChange();
    if (kind === "cat" && joy >= 3 && at - rewardAt > 12000) {
      rewardAt = at;
      onReward();
    }
    return true;
  }
  function state(at = now(), reduced = false) {
    const elapsed = Math.max(0, at - started),
      age = Math.max(0, at - actionAt),
      reactionLength =
        kind === "cat" && ["chase", "roll", "stretch", "nap"].includes(action)
          ? 5000
          : 3200;
    if (phase === "reacting" && age > reactionLength) {
      phase = "idle";
      onChange();
    }
    let pose = THEMES[theme].pose,
      kitten = "idle",
      embedded = false,
      x = 0.8,
      y = 0.6,
      size = 0.34,
      caption = THEMES[theme].label;
    if (kind === "cat") {
      caption = holding
        ? lap
          ? "膝上陪伴"
          : "抱着小黑"
        : phase === "reacting"
          ? {
              chase: "追逐影子",
              roll: "翻肚皮",
              stretch: "伸懒腰",
              nap: "安静蜷卧",
              lure: "扑羽毛",
              watch: "听呼噜",
            }[action] || "温柔互动"
          : "小黑在身边";
      if (holding) {
        embedded = true;
        pose =
          liftNeeded && age < 550
            ? "lift"
            : lap
              ? "lap"
              : action === "cuddle" || action === "pet"
                ? "nuzzle"
                : "hug";
      } else if (phase === "reacting" && puttingDown && age < 650) {
        embedded = true;
        pose = "lower";
      } else {
        if (puttingDown && age < 1050) {
          const f = Math.max(0, Math.min(1, (age - 650) / 400)),
            p = f * f * (3 - 2 * f);
          x = 0.72 + 0.08 * p;
          y = 0.63 - 0.03 * p;
          size = 0.28 + 0.06 * p;
        }
        pose =
          phase === "reacting" && ["pet", "headpat", "comfort"].includes(action)
            ? "stroke"
            : phase === "reacting" &&
                ["lure", "watch", "chase"].includes(action)
              ? "look"
              : "idle";
        if (phase === "reacting") {
          if (action === "lure") kitten = "play";
          else if (["pet", "watch"].includes(action)) kitten = "purr";
          else if (action === "roll") kitten = "roll";
          else if (action === "stretch") kitten = "stretch";
          else if (action === "nap") kitten = "curled";
          else if (action === "chase") {
            const t = reduced ? 0 : (age % 2400) / 2400;
            x = 0.8 + 0.48 * (t < 0.5 ? t * 2 : (1 - t) * 2);
            y = reduced
              ? 0.6
              : 0.6 - Math.abs(Math.sin((age * Math.PI) / 280)) * 0.022;
            kitten = t < 0.5 ? "run-right" : "run-left";
          }
        } else if (!reduced) {
          const idleAge = Math.max(
            0,
            at - (Number.isFinite(lastInteraction) ? lastInteraction : started),
          );
          const t = idleAge % 16000;
          if (t > 10000 && t < 12500) {
            kitten = "stretch";
          } else if (t >= 12500) {
            kitten = "curled";
          }
        }
      }
    } else if (phase === "reacting" && action === "breeze") pose = "breeze";
    return {
      kind,
      reduced,
      pose,
      phase,
      action,
      age,
      elapsed,
      joy,
      theme,
      time: THEMES[theme].time,
      caption,
      holding,
      lap,
      embedded,
      kitten,
      kittenPlacement: { x, y, size },
      frame: sceneFrame(elapsed, { reduced }),
      hearts:
        phase === "reacting" &&
        [
          "pet",
          "headpat",
          "comfort",
          "company",
          "hug",
          "cuddle",
          "lap",
        ].includes(action),
      breeze:
        (phase === "reacting" && action === "breeze") || theme === "garden",
      interactions,
    };
  }
  return {
    interact,
    selectTheme,
    state,
    get snapshot() {
      return {
        kind,
        phase,
        action,
        joy,
        time: THEMES[theme].time,
        theme,
        caption:
          kind === "cat"
            ? holding
              ? lap
                ? "膝上陪伴"
                : "抱着小黑"
              : "陪小黑玩"
            : THEMES[theme].label,
        holding,
        lap,
        interactions,
        started,
      };
    },
  };
}
module.exports = { createSceneGame, THEMES };
