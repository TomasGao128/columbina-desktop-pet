const { BrowserWindow } = require("electron");
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
async function run({ win, js, check, wait, isolated, temp }) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (b) => (raw += b));
    req.on("end", () => {
      calls.push({ body: JSON.parse(raw), route: req.url });
      if (req.url.startsWith("/auth")) {
        res.writeHead(401);
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (text) =>
        res.write(
          "data: " +
            JSON.stringify({ choices: [{ delta: { content: text } }] }) +
            "\n\n",
        );
      chunk(
        req.url.startsWith("/slow")
          ? "先收到的一小段"
          : raw.includes("HTML")
            ? '你好🌙，我在这里。<img src=x onerror="window.injected=true">'
            : "你好🌙，我在这里。",
      );
      if (req.url.startsWith("/slow")) {
        const timer = setInterval(() => res.write(": heartbeat\n\n"), 100);
        res.on("close", () => clearInterval(timer));
        return;
      }
      setTimeout(
        () =>
          res.end(
            "data: " +
              JSON.stringify({
                choices: [
                  {
                    delta: { content: " 一起慢慢来。" },
                    finish_reason: "stop",
                  },
                ],
              }) +
              "\n\ndata: [DONE]\n\n",
          ),
        100,
      );
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  let chat;
  const cjs = (source) => chat.webContents.executeJavaScript(source, true);
  const ccheck = async (name, source) => {
    const pass = !!(await cjs(source));
    await check(name, JSON.stringify(pass));
  };
  const until = async (source) => {
    const end = Date.now() + 6000;
    while (Date.now() < end) {
      if (await cjs(source)) return;
      await wait(50);
    }
    throw new Error("Chat UI state did not settle: " + source);
  };
  const open = async (mode = "chat") => {
    await js(`ipcRenderer.send('open-pet-chat',${JSON.stringify(mode)});true`);
    const end = Date.now() + 6000;
    do {
      chat = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().endsWith("chat.html"),
      );
      if (chat && !chat.webContents.isLoading()) break;
      await wait(50);
    } while (Date.now() < end);
    if (!chat) throw new Error("No chat window");
    await until(
      "document.getElementById('modeTitle').textContent===" +
        JSON.stringify(
          {
            chat: "陪伴聊天",
            paper: "论文修改",
            polish: "文字润色",
            summary: "提炼摘要",
          }[mode],
        ) +
        "&&!document.getElementById('send').disabled",
    );
  };
  const save = async (route = "", keep = true) => {
    // A closed stream may still be draining in the main process. Retry only
    // its explicit busy response, without masking validation or storage errors.
    const deadline = Date.now() + 6000;
    do {
      await until("!document.getElementById('saveConfig').disabled");
      await cjs(
        `document.getElementById('baseUrl').value=${JSON.stringify(base + route)};document.getElementById('model').value='mock-model';document.getElementById('apiKey').value='mock-encrypted-token';document.getElementById('saveHistory').checked=${keep};document.getElementById('configStatus').textContent='';document.getElementById('saveConfig').click();true`,
      );
      await until("document.getElementById('configStatus').textContent!==''");
      const message = await cjs(
        "document.getElementById('configStatus').textContent",
      );
      if (message.includes("设置已保存")) return;
      if (!message.includes("请先停止当前回复"))
        throw Error("Saving mock settings failed: " + message);
      await wait(80);
    } while (Date.now() < deadline);
    throw Error("Previous mock request did not release settings ownership");
  };

  const send = async (text = "测试") => {
    await until("!document.getElementById('send').disabled");
    await cjs(
      `document.getElementById('messageInput').value=${JSON.stringify(text)};document.getElementById('send').click();true`,
    );
  };
  try {
    await check(
      "assistant menu exposes all four practical modes",
      "MENU.some(g=>g.label==='助手'&&g.items.length===4)",
    );
    await check(
      "pet renderer cannot read private chat records over chat IPC",
      "ipcRenderer.invoke('chat-state').then(s=>s===null)",
    );
    await open();
    await ccheck(
      "chat window uses isolated preload without Node in the page",
      "typeof require==='undefined'&&typeof petChat.start==='function'",
    );
    await send();
    await wait(120);
    await ccheck(
      "missing API key gives setup guidance without a network request",
      "document.getElementById('status').textContent.includes('密钥')&&!document.getElementById('settingsPanel').hidden",
    );
    await save();
    await ccheck(
      "saving clears the visible password while exposing only key presence",
      "document.getElementById('apiKey').value===''&&petChat.state().then(s=>s.config.hasKey&&!('apiKey' in s.config))",
    );
    const raw = fs.readFileSync(
      path.join(isolated, "chat-config.json"),
      "utf8",
    );
    await check(
      "API key is encrypted in the isolated project file",
      JSON.stringify(!raw.includes("mock-encrypted-token")),
    );
    await cjs("document.getElementById('testConnection').click();true");
    await until(
      "document.getElementById('configStatus').textContent.includes('连接成功')",
    );
    await ccheck(
      "connection test does not add conversation history",
      "petChat.state().then(s=>s.history.length===0)",
    );
    await cjs("document.getElementById('closeSettings').click();true");
    await send("今天心情怎么样？");
    await until("document.getElementById('status').textContent==='回复完成。'");
    await ccheck(
      "streamed Unicode reply is plain selectable text without HTML execution",
      "document.querySelector('.message.assistant .content').textContent.includes('你好🌙')&&!document.querySelector('.message.assistant img')&&!window.injected",
    );
    await ccheck(
      "full response and user message are persisted",
      "petChat.state().then(s=>s.history.length===2&&s.history[1].content.includes('一起慢慢来'))",
    );
    fs.writeFileSync(
      path.join(temp, "chat-preview.png"),
      (await chat.webContents.capturePage()).toPNG(),
    );
    await send("HTML 标记测试");
    await until("document.getElementById('status').textContent==='回复完成。'");
    await ccheck(
      "API text cannot create executable HTML",
      "Array.from(document.querySelectorAll('.message.assistant .content')).at(-1).textContent.includes('<img')&&!document.querySelector('.message.assistant img')&&!window.injected",
    );
    for (const mode of ["polish", "paper", "summary"]) {
      await cjs(`document.querySelector('[data-mode="${mode}"]').click();true`);
      await until("!document.getElementById('send').disabled");
      await send("请改善这段表达：本研究采用相同条件进行比较。");
      await until(
        "document.getElementById('status').textContent==='回复完成。'",
      );
    }
    await check(
      "paper request contains factual-preservation policy and no unrelated chat",
      JSON.stringify(
        calls.some(
          (c) =>
            c.body.messages[0].content.includes("不得编造") &&
            c.body.messages.length === 2,
        ),
      ),
    );
    await cjs("document.getElementById('settingsToggle').click();true");
    await save("/auth");
    await cjs("document.getElementById('testConnection').click();true");
    await until(
      "document.getElementById('configStatus').textContent.includes('密钥无效')",
    );
    await ccheck(
      "provider authentication errors are shown with recovery guidance",
      "document.getElementById('configStatus').textContent.includes('API 设置')",
    );
    await save("/slow");
    await cjs(
      "document.getElementById('closeSettings').click();document.querySelector('[data-mode=chat]').click();true",
    );
    await send("等待一段长回复");
    await until(
      "Array.from(document.querySelectorAll('.message.assistant .content')).at(-1)?.textContent.includes('先收到')",
    );
    await ccheck(
      "duplicate requests are rejected while a response is running",
      "petChat.start({id:'duplicate',mode:'chat',text:'不能重复'}).then(r=>!r.ok)",
    );
    await cjs("document.getElementById('stop').click();true");
    await until(
      "document.getElementById('status').textContent.includes('已停止')",
    );
    await ccheck(
      "stop preserves partial text and releases the send button",
      "!document.getElementById('send').disabled&&petChat.state().then(s=>s.history.at(-1).partial===true)",
    );
    await send("清空时的未完成回复");
    await wait(180);
    await cjs(
      "window.confirm=()=>true;document.getElementById('clearHistory').click();true",
    );
    await wait(250);
    await ccheck(
      "clear during streaming cannot resurrect deleted records",
      "petChat.state().then(s=>s.history.length===0&&document.querySelectorAll('.message').length===0)",
    );
    await check(
      "clearing also deletes the history file",
      JSON.stringify(!fs.existsSync(path.join(isolated, "chat-history.json"))),
    );
    await cjs("document.getElementById('settingsToggle').click();true");
    await save("", false);
    await cjs("document.getElementById('closeSettings').click();true");
    await send("不保存的聊天");
    await until("document.getElementById('status').textContent==='回复完成。'");
    await check(
      "disabled history never creates a chat log on disk",
      JSON.stringify(!fs.existsSync(path.join(isolated, "chat-history.json"))),
    );
    await cjs("document.getElementById('settingsToggle').click();true");
    await save("/slow", false);
    await cjs("document.getElementById('closeSettings').click();true");
    await send("关窗取消");
    await wait(160);
    chat.close();
    await wait(180);
    await open("paper");
    await ccheck(
      "reopen restores encrypted settings and the requested mode",
      "document.getElementById('modeTitle').textContent==='论文修改'&&document.getElementById('apiKey').value===''",
    );
    await ccheck(
      "pet remains alive after closing the independent chat panel",
      "petChat.state().then(s=>s.config.hasKey)",
    );
    await cjs("document.getElementById('settingsToggle').click();true");
    await save("", true);
    await cjs("document.getElementById('closeSettings').click();true");
    await send("关窗后可以重新请求");
    await until("document.getElementById('status').textContent==='回复完成。'");
    await ccheck(
      "closing a stream releases ownership for the next request",
      "!document.getElementById('send').disabled",
    );
    await require("./chat-companion-checks.cjs").run({
      cjs,
      ccheck,
      js,
      check,
      wait,
      until,
      send,
      calls,
      isolated,
      temp,
      chat,
      win,
    });
    chat.setSize(640, 560);
    await wait(100);
    await ccheck(
      "compact chat window stays within its horizontal viewport",
      "document.documentElement.scrollWidth<=innerWidth",
    );
    fs.writeFileSync(
      path.join(temp, "chat-compact-preview.png"),
      (await chat.webContents.capturePage()).toPNG(),
    );
    chat.close();
    await wait(80);
  } finally {
    if (chat && !chat.isDestroyed()) chat.destroy();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
module.exports = { run };
