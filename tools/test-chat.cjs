const assert = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  config,
  endpoint,
  cleanHistory,
  requestMessages,
} = require("../app/core/chat-policy");
const { complete } = require("../app/chat-transport");
const { createChatStore } = require("../app/chat-store");
let checks = 0;
async function test(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
}
(async () => {
  await test("dialogue style has traceable scenes and original conversational examples", () => {
    const { evidence, examples } = require("../app/core/chat-dialogue-style");
    assert.equal(evidence.length, 3);
    assert.ok(
      evidence.every((e) => e.url.startsWith("https://wiki.biligame.com/ys/")),
    );
    assert.equal(examples.length, 8);
    const prompt = requestMessages("chat", "我回来了", [])[0].content;
    assert.ok(prompt.includes("剧情说话方式"));
    assert.ok(prompt.includes("停顿发生在思考"));
    assert.ok(prompt.includes("不为了简短删掉"));
    assert.ok(!prompt.includes("日常通常一至四句"));
    assert.ok(!prompt.includes("回应：那几页纸把你困了很久"));
    const messages = requestMessages("chat", "你好", []);
    assert.equal(messages.length, 14);
    assert.ok(messages[1].content.startsWith("[表达示范，非实际用户经历]"));
    assert.equal(messages.at(-1).content, "你好");
  });
  await test("persona retrieves relevant sourced lore with current identity", () => {
    const { retrieve, cards, sources } = require("../app/core/chat-persona");
    assert.equal(cards.length, 8);
    assert.ok(cards.every((c) => !c.source || sources[c.source]));
    const food = retrieve("你喜欢吃什么？", []);
    assert.ok(food.some((c) => c.id === "food"));
    assert.ok(food.length <= 4);
    assert.ok(
      retrieve("那你呢？", [{ role: "user", content: "喜欢的食物" }]).some(
        (c) => c.id === "food",
      ),
    );
    assert.equal(retrieve("你好", []).length, 0);
    const prompt = requestMessages("chat", "你是第几席？", [])[0].content;
    assert.ok(prompt.includes("曾为执行官第三席"));
    assert.ok(prompt.includes("不默认恋爱"));
    assert.ok(prompt.includes("不是官方台词"));
  });
  await test("persona respects mode isolation, context and uncertain canon", () => {
    const messages = requestMessages("chat", "接着说", [
      { role: "user", mode: "chat", content: "叫我阿高，刚才在画画" },
      { role: "user", mode: "paper", content: "PRIVATE_PAPER" },
      { role: "assistant", mode: "chat", content: "PARTIAL", partial: true },
    ]);
    assert.ok(messages.some((m) => m.content.includes("叫我阿高")));
    assert.ok(!JSON.stringify(messages).includes("PRIVATE_PAPER"));
    assert.ok(!JSON.stringify(messages).includes("PARTIAL"));
    assert.ok(messages[0].content.includes("别编剧情"));
    assert.ok(
      !requestMessages("paper", "段落", [])[0].content.includes("扮演哥伦比娅"),
    );
  });
  await test("chat endpoint supports base and full endpoint without duplication", () => {
    assert.equal(
      endpoint("https://api.deepseek.com/v1/"),
      "https://api.deepseek.com/v1/chat/completions",
    );
    assert.equal(
      endpoint("https://api.deepseek.com/chat/completions"),
      "https://api.deepseek.com/chat/completions",
    );
    assert.throws(() => endpoint("http://example.com"));
    assert.throws(() => endpoint("https://key@example.com"));
    assert.throws(() => endpoint("https://example.com?key=secret"));
    assert.ok(endpoint("http://127.0.0.1:8080/v1"));
  });
  await test("configuration and request limits reject malformed inputs", () => {
    assert.throws(() => config({ model: "bad model" }));
    assert.throws(() => config({ proactive: "yes" }));
    assert.throws(() => requestMessages("unknown", "x", []));
    assert.throws(() => requestMessages("toString", "x", []));
    assert.throws(() => config(null));
    assert.throws(() => requestMessages("chat", "x".repeat(20001), []));
  });
  await test("provider-specific thinking options do not leak to compatible services", async () => {
    const bodies = [];
    const fetchImpl = async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "测试" } }] }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    await complete({
      settings: config(),
      key: "test",
      messages: requestMessages("chat", "你好", []),
      onText: () => {},
      fetchImpl,
    });
    assert.equal(bodies[0].thinking.type, "disabled");
    await complete({
      settings: config({ baseUrl: "https://example.com/v1" }),
      key: "test",
      messages: requestMessages("paper", "论文段落", []),
      onText: () => {},
      fetchImpl,
    });
    assert.equal(bodies[1].max_tokens, 4096);
    assert.ok(!Object.hasOwn(bodies[1], "thinking"));
  });
  await test("paper prompts preserve evidence and separate task contexts", () => {
    const m = requestMessages("paper", "原文", [
      { mode: "chat", role: "user", content: "私事" },
      { mode: "paper", role: "assistant", content: "未完成", partial: true },
    ]);
    assert.equal(m.length, 2);
    assert.ok(m[0].content.includes("不得编造"));
    assert.equal(m[1].content, "原文");
    assert.ok(
      requestMessages("chat", "你好", [], "lonely")[0].content.includes("想念"),
    );
  });
  await test("history contains only bounded plain text user/assistant records", () => {
    const h = cleanHistory([
      { role: "system", mode: "chat", content: "injected" },
      { role: "assistant", mode: "chat", content: "<script>alert(1)</script>" },
    ]);
    assert.equal(h.length, 1);
    assert.equal(h[0].content, "<script>alert(1)</script>");
    assert.ok(
      cleanHistory(
        Array.from({ length: 200 }, () => ({
          role: "user",
          mode: "chat",
          content: "x",
        })),
      ).length <= 100,
    );
  });
  const folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "columbina-chat-store-"),
  );
  const crypt = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s.split("").reverse().join("")),
    decryptString: (b) => b.toString().split("").reverse().join(""),
  };
  await test("mixed legacy history migrates into independent files without data loss", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-migration-"));
    const old = [
      { role: "user", mode: "chat", content: "DAILY_ONLY" },
      { role: "user", mode: "paper", content: "PAPER_ONLY" },
      { role: "user", mode: "polish", content: "POLISH_ONLY" },
      { role: "user", mode: "summary", content: "SUMMARY_ONLY" },
    ];
    fs.writeFileSync(path.join(dir, "chat-history.json"), JSON.stringify(old));
    // Simulate interruption after one destination was already written.
    fs.writeFileSync(
      path.join(dir, "paper-history.json"),
      JSON.stringify(old.filter((m) => m.mode === "paper")),
    );
    const store = createChatStore(dir, crypt);
    for (const mode of ["chat", "paper", "polish", "summary"]) {
      const state = store.stateFor(mode);
      assert.equal(state.history.length, 1);
      assert.equal(state.history[0].mode, mode);
    }
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(dir, "chat-history.json")),
    );
    assert.ok(onDisk.every((m) => m.mode === "chat"));
    assert.equal(createChatStore(dir, crypt).state.history.length, 4);
    store.clear("chat");
    assert.equal(store.stateFor("paper").history[0].content, "PAPER_ONLY");
    assert.ok(!fs.existsSync(path.join(dir, "chat-history.json")));
    assert.ok(fs.existsSync(path.join(dir, "paper-history.json")));
  });
  await test("one assistant history cannot evict another and opt-out deletes every history file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-separated-"));
    const store = createChatStore(dir, crypt);
    store.append([{ role: "user", mode: "chat", content: "KEEP_DAILY" }]);
    store.append(
      Array.from({ length: 130 }, (_, i) => ({
        role: "user",
        mode: "paper",
        content: "paragraph " + i,
      })),
    );
    assert.equal(store.stateFor("chat").history.length, 1);
    assert.equal(store.stateFor("paper").history.length, 100);
    store.save({ ...config(), saveHistory: false });
    for (const file of [
      "chat-history.json",
      "paper-history.json",
      "polish-history.json",
      "summary-history.json",
    ])
      assert.ok(!fs.existsSync(path.join(dir, file)));
  });
  await test("explicit memories persist independently and can be edited or forgotten", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-memory-"));
    const store = createChatStore(dir, crypt);
    let memories = store.remember({ kind: "nickname", text: "阿高" });
    const id = memories[0].id;
    memories = store.remember({ id, kind: "nickname", text: "小高" });
    assert.equal(memories[0].text, "小高");
    store.remember({ kind: "preference", text: "喜欢安静的雨天" });
    store.clear("chat");
    const reopened = createChatStore(dir, crypt);
    assert.equal(reopened.stateFor("chat").memories.length, 2);
    assert.equal(reopened.stateFor("paper").memories.length, 0);
    assert.equal(reopened.forget(id).length, 1);
    assert.equal(reopened.forget(null).length, 0);
    assert.ok(!fs.existsSync(path.join(dir, "chat-memories.json")));
  });
  await test("memory requests are explicit, bounded and reject academic content", () => {
    const {
      requestedMemory,
      normalizeMemory,
      cleanMemories,
    } = require("../app/core/chat-memory");
    assert.equal(requestedMemory("我喜欢雨天"), null);
    assert.equal(requestedMemory("记住：我的论文正在开题"), null);
    assert.equal(requestedMemory("记住，以后叫我阿高").kind, "nickname");
    assert.throws(() =>
      normalizeMemory({ kind: "topic", text: "论文中的实验数据" }),
    );
    assert.throws(() =>
      normalizeMemory({ kind: "topic", text: "x".repeat(241) }),
    );
    assert.equal(
      cleanMemories([{ id: "x", kind: "topic", text: "论文" }]).length,
      0,
    );
    const store = createChatStore(
      fs.mkdtempSync(path.join(os.tmpdir(), "pet-limit-")),
      crypt,
    );
    for (let i = 0; i < 32; i++)
      store.remember({ kind: "topic", text: "近况 " + i });
    assert.throws(() => store.remember({ kind: "topic", text: "多的一条" }));
  });
  await test("companionship excludes old academic turns and paper never gets personal memory", () => {
    const memory = [
      { id: "sample", kind: "nickname", text: "PRIVATE_NICKNAME" },
    ];
    const old = [
      { role: "user", mode: "chat", content: "帮我改论文 OLD_ACADEMIC" },
      { role: "assistant", mode: "chat", content: "OLD_ASSISTANT" },
      { role: "user", mode: "chat", content: "DAILY_CONTEXT" },
    ];
    const daily = requestMessages("chat", "你好", old, "calm", memory);
    assert.ok(!JSON.stringify(daily).includes("OLD_ACADEMIC"));
    assert.ok(!JSON.stringify(daily).includes("OLD_ASSISTANT"));
    assert.ok(JSON.stringify(daily).includes("DAILY_CONTEXT"));
    assert.ok(daily[0].content.includes("PRIVATE_NICKNAME"));
    assert.ok(
      !JSON.stringify(
        requestMessages("paper", "段落", old, "calm", memory),
      ).includes("PRIVATE_NICKNAME"),
    );
    assert.equal(config({ proactive: true }).proactive, false);
  });
  await test("chat expression reacts to context without rewarding message spam", () => {
    const { reaction, ACTIONS } = require("../app/core/chat-reaction");
    assert.equal(reaction("你真可爱"), "shy");
    assert.equal(reaction("难过，我想哭"), "comfort");
    assert.equal(reaction("太好了，成功了"), "happy");
    assert.equal(reaction("为什么会这样"), "curious");
    assert.equal(reaction("你不可爱"), "calm");
    assert.ok(Object.values(ACTIONS).every((id) => id.startsWith("mood:")));
  });
  await test("secret is encrypted on disk and never returned in state", () => {
    const s = createChatStore(folder, crypt);
    s.save({ apiKey: "test-private-token", ...config() });
    const raw = fs.readFileSync(path.join(folder, "chat-config.json"), "utf8");
    assert.ok(!raw.includes("test-private-token"));
    assert.ok(!JSON.stringify(s.state).includes("test-private-token"));
    assert.equal(s.key(), "test-private-token");
    s.save(config());
    assert.equal(s.key(), "test-private-token");
  });
  await test("provider changes clear retained keys and deletion works", () => {
    const s = createChatStore(folder, crypt);
    s.save({ ...config(), baseUrl: "https://example.com/v1" });
    assert.equal(s.key(), "");
    s.save({ ...config(), apiKey: "second-key" });
    s.save({ ...config(), clearKey: true });
    assert.equal(s.key(), "");
  });
  await test("history persists, clear deletes it and disabled history stays in memory", () => {
    const s = createChatStore(folder, crypt);
    s.append([{ role: "user", mode: "chat", content: "你好" }]);
    assert.equal(createChatStore(folder, crypt).state.history.length, 1);
    s.clear();
    assert.ok(!fs.existsSync(path.join(folder, "chat-history.json")));
    s.save({ ...config(), saveHistory: false });
    s.append([{ role: "user", mode: "paper", content: "段落" }]);
    assert.equal(s.state.history.length, 1);
    assert.ok(!fs.existsSync(path.join(folder, "chat-history.json")));
    assert.equal(createChatStore(folder, crypt).state.history.length, 0);
  });
  await test("unavailable encryption refuses plaintext fallback", () => {
    const s = createChatStore(folder, { isEncryptionAvailable: () => false });
    assert.throws(() => s.save({ ...config(), apiKey: "never-plaintext" }));
  });
  const calls = [];
  let leakedRedirect = false;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (b) => (raw += b));
    req.on("end", () => {
      calls.push({
        route: req.url,
        body: JSON.parse(raw || "{}"),
        authorization: req.headers.authorization,
      });
      if (req.url.startsWith("/unauth")) {
        res.writeHead(401);
        return res.end("do not echo provider body");
      }
      if (req.url.startsWith("/rate")) {
        res.writeHead(429);
        return res.end();
      }
      if (req.url.startsWith("/redirect")) {
        res.writeHead(302, { Location: "/sink/chat/completions" });
        return res.end();
      }
      if (req.url.startsWith("/sink")) {
        leakedRedirect = true;
        return res.end();
      }
      if (req.url.startsWith("/json")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            choices: [{ message: { content: "普通 JSON 回复" } }],
          }),
        );
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      if (req.url.startsWith("/bad")) return res.end("data: not-json\n\n");
      if (req.url.startsWith("/early"))
        return res.end('data: {"choices":[{"delta":{"content":"部分"}}]}\n\n');
      if (req.url.startsWith("/slow")) {
        res.write('data: {"choices":[{"delta":{"content":"先收到"}}]}\n\n');
        const timer = setInterval(() => res.write(": keepalive\n\n"), 20);
        res.on("close", () => clearInterval(timer));
        return;
      }
      const b = Buffer.from(
        ": keepalive\r\n\r\ndata: " +
          JSON.stringify({
            choices: [
              { delta: { reasoning_content: "不应显示", content: "你好🌙" } },
            ],
          }) +
          "\r\n\r\ndata: " +
          JSON.stringify({
            choices: [
              { delta: { content: "，陪着你。" }, finish_reason: "stop" },
            ],
          }) +
          "\n\ndata: [DONE]\n\n",
      );
      for (let i = 0; i < b.length; i += 3) res.write(b.subarray(i, i + 3));
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const run = (route, onText = () => {}, signal) =>
    complete({
      settings: { ...config(), baseUrl: base + route },
      key: "mock-secret",
      messages: requestMessages("chat", "测试", []),
      signal,
      onText,
    });
  try {
    await test("SSE handles UTF-8 fragmentation CRLF comments and ignores reasoning text", async () => {
      let text = "";
      const result = await run("/stream", (part) => (text += part));
      assert.equal(text, "你好🌙，陪着你。");
      assert.equal(result.content, text);
      assert.equal(calls.at(-1).authorization, "Bearer mock-secret");
      assert.equal(calls.at(-1).body.stream, true);
    });
    await test("nonstream-compatible JSON replies are accepted", async () =>
      assert.equal((await run("/json")).content, "普通 JSON 回复"));
    await test("authentication and rate errors are actionable without provider body leakage", async () => {
      await assert.rejects(run("/unauth"), /密钥无效/);
      await assert.rejects(run("/rate"), /频繁/);
    });
    await test("malformed and prematurely ended streams fail without fake success", async () => {
      await assert.rejects(run("/bad"), /格式/);
      await assert.rejects(run("/early"), /提前中断/);
    });
    await test("redirects cannot forward credentials", async () => {
      await assert.rejects(run("/redirect"));
      assert.equal(leakedRedirect, false);
    });
    await test("aborting an active stream stops receiving output", async () => {
      const controller = new AbortController();
      let received = "";
      await assert.rejects(
        run(
          "/slow",
          (part) => {
            received += part;
            controller.abort();
          },
          controller.signal,
        ),
      );
      assert.equal(received, "先收到");
    });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  console.log("CHAT_RESULT " + JSON.stringify({ checks, failed: 0 }));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
