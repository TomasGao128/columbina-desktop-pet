const { companionPrompt } = require("./chat-persona");
const { examples } = require("./chat-dialogue-style");
const { companionHistory } = require("./chat-memory");
const DEFAULT_CONFIG = Object.freeze({
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
  saveHistory: true,
  proactive: false,
});
const MODES = Object.freeze({
  chat: "陪伴聊天",
  polish: "文字润色",
  paper: "论文修改",
  summary: "提炼摘要",
});
function endpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("API 地址格式不正确。");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "请使用 HTTPS 地址；本机服务可使用 HTTP。地址中不要包含密钥、查询参数或片段。",
    );
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/chat/completions"))
    url.pathname += "/chat/completions";
  return url.href;
}
function config(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("聊天设置格式不正确。");
  const next = { ...DEFAULT_CONFIG };
  for (const key of ["baseUrl", "model", "saveHistory", "proactive"])
    if (Object.hasOwn(value, key)) next[key] = value[key];
  if (typeof next.baseUrl !== "string" || next.baseUrl.length > 500)
    throw new Error("API 地址过长。");
  endpoint(next.baseUrl);
  if (typeof next.model !== "string" || !/^[\w./:-]{1,100}$/.test(next.model))
    throw new Error("请输入有效的模型名称。");
  if (
    typeof next.saveHistory !== "boolean" ||
    typeof next.proactive !== "boolean"
  )
    throw new Error("聊天设置格式不正确。");
  // Proactive sharing is disabled for this release, including old saved preferences.
  next.proactive = false;
  return next;
}
function cleanHistory(value) {
  if (!Array.isArray(value)) return [];
  let size = 0;
  return value
    .slice(-100)
    .reverse()
    .filter((m) => {
      if (
        !m ||
        !["user", "assistant"].includes(m.role) ||
        !Object.hasOwn(MODES, m.mode) ||
        typeof m.content !== "string" ||
        m.content.length > 64000 ||
        !m.content.trim()
      )
        return false;
      if (size + m.content.length > 160000) return false;
      size += m.content.length;
      return true;
    })
    .reverse()
    .map((m) => ({
      role: m.role,
      mode: m.mode,
      content: m.content,
      ...(m.partial ? { partial: true } : {}),
    }));
}
function requestMessages(mode, text, history, mood = "calm", memories = []) {
  if (
    !Object.hasOwn(MODES, mode) ||
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 20000
  )
    throw new Error("请输入内容，每次最多 20000 字符。");
  const prompts = {
    polish:
      "你是中文文字编辑。保留原文事实、语义和语气，改善表达、结构和语病。先给润色后的完整文本，再简要说明关键修改；不补编信息。",
    paper:
      "你是严谨的论文语言编辑。保留原文研究结论、数据、公式、引文编号和技术术语，改善论证组织与学术表达。先给修改后的段落，再列重要修改及需作者核实之处。不得编造实验、文献、数据或研究结论；信息不足时明确指出。",
    summary:
      "准确提炼用户文本的摘要、核心观点和待办（如有），忠于原文，区分原文事实与推断，不补编信息。",
  };
  let budget = 30000;
  const eligible =
    mode === "chat"
      ? companionHistory(cleanHistory(history))
      : cleanHistory(history);
  const previous = eligible
    .filter((m) => m.mode === mode && !m.partial)
    .slice(-20)
    .reverse()
    .filter((m) => {
      budget -= m.content.length;
      return budget >= 0;
    })
    .reverse()
    .map(({ role, content }) => ({ role, content }));
  return [
    {
      role: "system",
      content:
        mode === "chat"
          ? companionPrompt(text.trim(), previous, mood, memories)
          : prompts[mode],
    },
    ...(mode === "chat"
      ? examples.slice(0, 6).flatMap((example) => [
          {
            role: "user",
            content: `[表达示范，非实际用户经历] ${example.user}`,
          },
          { role: "assistant", content: example.reply },
        ])
      : []),
    ...previous,
    { role: "user", content: text.trim() },
  ];
}
module.exports = {
  DEFAULT_CONFIG,
  MODES,
  endpoint,
  config,
  cleanHistory,
  requestMessages,
};
