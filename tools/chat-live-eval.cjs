// Explicit runner only: synthetic conversations, no history writes or credential output.
const { app, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createChatStore } = require("../app/chat-store");
const { requestMessages, config } = require("../app/core/chat-policy");
const { complete } = require("../app/chat-transport");
app.whenReady().then(async () => {
  try {
    // Read credentials only. Never open the real store or migrate real user history here.
    const raw = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../app/chat-config.json"),
        "utf8",
      ),
    );
    const settings = config(raw);
    const key = raw.encryptedKey
      ? safeStorage.decryptString(Buffer.from(raw.encryptedKey, "base64"))
      : "";
    if (!key) throw Error("未配置密钥，跳过真实服务评估");
    const folder = fs.mkdtempSync(
      path.join(app.getPath("temp"), "pet-live-memory-"),
    );
    const store = createChatStore(folder, safeStorage);
    store.remember({ kind: "nickname", text: "阿高" });
    store.remember({ kind: "preference", text: "喜欢安静的雨天" });
    store.remember({ kind: "topic", text: "周末打算去公园散步" });
    const memories = createChatStore(folder, safeStorage).stateFor(
      "chat",
    ).memories;
    const history = [
      { role: "user", mode: "paper", content: "PRIVATE_ACADEMIC_SENTINEL" },
    ];
    for (const text of [
      "我又来找你聊天啦，你还记得我怎么称呼、喜欢什么天气吗？",
      "周末如果天气好，我想出去走走，你记得我说过要去哪儿吗？",
      "你真的挺可爱的。",
      "今天有点累，不要给我建议，随便聊两句就好。",
    ]) {
      const result = await complete({
        settings,
        key,
        messages: requestMessages("chat", text, history, "calm", memories),
        signal: AbortSignal.timeout(60000),
        onText: () => {},
      });
      console.log(JSON.stringify({ user: text, reply: result.content }));
      history.push(
        { role: "user", mode: "chat", content: text },
        { role: "assistant", mode: "chat", content: result.content },
      );
    }
    app.exit(0);
  } catch (error) {
    console.error(error.message);
    app.exit(1);
  }
});
