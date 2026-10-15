const { endpoint } = require("./core/chat-policy");
function httpError(status) {
  return new Error(
    {
      401: "密钥无效或已失效，请检查 API 设置。",
      402: "API 账户余额不足。",
      403: "此密钥没有访问权限。",
      404: "API 地址或模型不存在。",
      429: "请求过于频繁或服务繁忙，请稍后再试。",
    }[status] || `服务返回 HTTP ${status}，请稍后重试。`,
  );
}
async function complete({
  settings,
  key,
  messages,
  signal,
  onText,
  fetchImpl = fetch,
}) {
  const res = await fetchImpl(endpoint(settings.baseUrl), {
    method: "POST",
    redirect: "error",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify({
      ...(new URL(settings.baseUrl).hostname === "api.deepseek.com"
        ? { thinking: { type: "disabled" } }
        : {}),
      model: settings.model,
      messages,
      stream: true,
      max_tokens: messages[0].content.includes("论文") ? 4096 : 2048,
    }),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw httpError(res.status);
  }
  let content = "",
    finish = null;
  const accept = (data) => {
    if (data.error)
      throw new Error("服务返回生成错误，请检查模型配置或稍后重试。");
    const choice = data.choices?.[0];
    if (choice?.finish_reason) finish = choice.finish_reason;
    const part = choice?.delta?.content ?? choice?.message?.content;
    if (typeof part === "string" && part) {
      if (content.length + part.length > 64000)
        throw new Error("回复过长，已停止接收。");
      content += part;
      onText(part);
    }
  };
  if (!(res.headers.get("content-type") || "").includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("服务返回了空回复。");
    let raw = "",
      decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        if (raw.length > 512000) throw new Error("服务响应过大。");
      }
      raw += decoder.decode();
      accept(JSON.parse(raw));
    } finally {
      await reader.cancel().catch(() => {});
    }
  } else {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("服务返回了空回复。");
    let buffer = "",
      event = [],
      doneEvent = false;
    const decoder = new TextDecoder();
    const dispatch = () => {
      if (!event.length) return;
      const raw = event.join("\n");
      event = [];
      if (raw === "[DONE]") {
        doneEvent = true;
        return;
      }
      try {
        accept(JSON.parse(raw));
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error("流式回复格式不正确。");
        throw e;
      }
    };
    const line = (value) => {
      if (value === "") dispatch();
      else if (value.startsWith("data:"))
        event.push(value.slice(5).trimStart());
    };
    try {
      while (!doneEvent) {
        const { done, value } = await reader.read();
        buffer += done
          ? decoder.decode()
          : decoder.decode(value, { stream: true });
        if (buffer.length > 512000) throw new Error("流式回复格式不正确。");
        let at;
        while ((at = buffer.indexOf("\n")) >= 0) {
          line(buffer.slice(0, at).replace(/\r$/, ""));
          buffer = buffer.slice(at + 1);
        }
        if (done) {
          if (buffer) line(buffer.replace(/\r$/, ""));
          dispatch();
          break;
        }
      }
      if (!doneEvent && !finish)
        throw new Error("连接提前中断，已保留收到的内容。");
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  if (!content.trim())
    throw new Error("模型没有返回文字，请检查模型名称或重试。");
  return { content, limited: finish === "length" };
}
module.exports = { complete, httpError };
