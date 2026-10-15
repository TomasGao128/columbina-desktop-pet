const ACTIONS = Object.freeze({
  happy: "mood:cheer",
  curious: "mood:expect",
  shy: "mood:shy",
  comfort: "mood:coax",
});
function reaction(text) {
  if (typeof text !== "string") return "calm";
  const value = text.slice(0, 1000);
  if (/难过|伤心|累了|疲惫|孤独|不开心|心情不好|烦死|想哭/.test(value))
    return "comfort";
  if (/不可爱|不好看|不漂亮|不喜欢你/.test(value)) return "calm";
  if (/可爱|漂亮|好看|喜欢你|夸夸|好乖/.test(value)) return "shy";
  if (/开心|高兴|成功了|太好了|好消息|赢了/.test(value)) return "happy";
  if (/好奇|为什么|怎么回事|想知道|有意思|新发现/.test(value)) return "curious";
  return "calm";
}
module.exports = { ACTIONS, reaction };
