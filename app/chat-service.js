const { BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("node:path");
const { createChatStore } = require("./chat-store");
const { complete } = require("./chat-transport");
const { MODES, requestMessages } = require("./core/chat-policy");
const { requestedMemory, isAcademic } = require("./core/chat-memory");
const { reaction } = require("./core/chat-reaction");
function installChatService({ folder, getPet, getMood }) {
  let panel = null,
    store = null,
    active = null;
  const data = () => store || (store = createChatStore(folder, safeStorage));
  const valid = (event) => event.sender === panel?.webContents;
  const emit = (payload) => {
    if (panel && !panel.isDestroyed())
      panel.webContents.send("chat-event", payload);
  };
  const preferences = () => ({ proactive: data().state.config.proactive });
  function cancel(id) {
    if (active && (!id || active.id === id)) active.controller.abort();
  }
  function open(mode = "chat") {
    if (!Object.hasOwn(MODES, mode)) mode = "chat";
    if (panel && !panel.isDestroyed()) {
      panel.show();
      panel.focus();
      panel.webContents.send("chat-mode", mode);
      return;
    }
    panel = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 620,
      minHeight: 520,
      title: "哥伦比娅 · 聊天与文字助手",
      backgroundColor: "#f6f2fa",
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(folder, "chat-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    panel.webContents.on("will-navigate", (event) => event.preventDefault());
    panel.webContents.on("did-start-loading", () => cancel());
    panel.webContents.on("render-process-gone", () => cancel());
    panel.once("ready-to-show", () => {
      panel.show();
      panel.webContents.send("chat-mode", mode);
    });
    panel.on("closed", () => {
      cancel();
      panel = null;
    });
    panel.loadFile(path.join(folder, "renderer/chat.html"));
  }
  ipcMain.on("open-pet-chat", (event, mode) => {
    if (event.sender === getPet()?.webContents) open(mode);
  });
  ipcMain.on("chat-preferences", (event) => {
    event.returnValue =
      event.sender === getPet()?.webContents ? preferences() : {};
  });
  ipcMain.handle("chat-state", (event, mode = "chat") => {
    if (!valid(event) || !Object.hasOwn(MODES, mode)) return null;
    return data().stateFor(mode);
  });
  ipcMain.handle("chat-memory", (event, input) => {
    if (!valid(event) || active)
      return { ok: false, error: "请先停止当前回复，再修改记忆。" };
    try {
      if (!input || !["save", "forget", "clear"].includes(input.action))
        throw new Error("记忆操作不正确。");
      const memories =
        input.action === "save"
          ? data().remember(input)
          : data().forget(input.action === "clear" ? null : input.id);
      return { ok: true, memories };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle("chat-save", (event, input) => {
    if (!valid(event) || active)
      return { ok: false, error: "请先停止当前回复，再修改设置。" };
    try {
      data().save(input);
      const state = data().stateFor(
        Object.hasOwn(MODES, input.mode) ? input.mode : "chat",
      );
      getPet()?.webContents.send("chat-preferences-changed", preferences());
      return { ok: true, ...state };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("chat-clear", (event, mode = "chat") => {
    if (!valid(event)) return null;
    if (!Object.hasOwn(MODES, mode)) return null;
    if (active?.mode === mode) {
      active.cleared = true;
      cancel();
    }
    data().clear(mode);
    return data().stateFor(mode);
  });
  ipcMain.handle("chat-cancel", (event, id) => {
    if (valid(event)) cancel(id);
    return true;
  });
  ipcMain.handle("chat-start", (event, input) => {
    if (!valid(event) || active)
      return { ok: false, error: "已有回复正在进行，请先停止。" };
    try {
      if (!input || !/^[-\w]{1,80}$/.test(input.id))
        throw new Error("请求格式不正确。");
      const test = input.test === true,
        mode = test ? "chat" : input.mode;
      if (!Object.hasOwn(MODES, mode))
        throw new Error("请选择有效的助手模式。");
      const state = data().stateFor(mode),
        key = data().key();
      if (
        !key &&
        !["localhost", "127.0.0.1", "[::1]"].includes(
          new URL(state.config.baseUrl).hostname,
        )
      )
        throw new Error("请先打开连接设置，填写并保存 API 密钥。");
      const text = test ? "请只回复“你好”。" : input.text;
      if (mode === "chat" && !test && isAcademic(text))
        throw new Error(
          "论文相关内容请切换到「论文修改」。陪伴聊天不读取或讨论论文记录。",
        );
      let memoryNotice = "";
      const messages = requestMessages(
        mode,
        text,
        test ? [] : state.history,
        getMood(),
        test ? [] : state.memories,
      );
      if (mode === "chat" && !test) {
        const remember = requestedMemory(text);
        if (remember) {
          try {
            data().remember(remember);
            memoryNotice = "已记住，可在「陪伴记忆」中修改或忘记。";
          } catch (error) {
            memoryNotice = error.message;
          }
        }
      }
      if (!test) data().append([{ role: "user", mode, content: text.trim() }]);
      const task = {
        id: input.id,
        mode,
        test,
        text,
        controller: new AbortController(),
        content: "",
        cleared: false,
      };
      active = task;
      setImmediate(async () => {
        const timeout = setTimeout(() => {
          task.timedOut = true;
          task.controller.abort();
        }, 120000);
        try {
          const result = await complete({
            settings: state.config,
            key: key || "local",
            messages,
            signal: task.controller.signal,
            onText: (part) => {
              task.content += part;
              emit({ id: task.id, type: "delta", text: part });
            },
          });
          if (task.controller.signal.aborted) throw new Error("Stopped");
          if (!test && !task.cleared)
            data().append([
              { role: "assistant", mode, content: result.content },
            ]);
          emit({
            id: task.id,
            type: "done",
            limited: result.limited,
            test,
            memoryNotice,
          });
          if (mode === "chat" && !test && !task.cleared) {
            const pet = getPet();
            if (pet && !pet.isDestroyed())
              pet.webContents.send("chat-pet-reply", {
                text: result.content.split(/\n/)[0].slice(0, 90),
                emotion: reaction(text),
              });
          }
        } catch (e) {
          const stopped = task.controller.signal.aborted && !task.timedOut;
          if (!test && !task.cleared && task.content)
            data().append([
              { role: "assistant", mode, content: task.content, partial: true },
            ]);
          emit({
            id: task.id,
            type: stopped ? "stopped" : "error",
            error: task.timedOut
              ? "回复超时，已停止请求。"
              : stopped
                ? "已停止，收到的文字已保留。"
                : e.message === "fetch failed"
                  ? "无法连接 API，请检查地址、网络或代理。"
                  : e.message || "请求失败，请检查连接设置。",
          });
        } finally {
          clearTimeout(timeout);
          if (active === task) active = null;
        }
      });
      return { ok: true, id: task.id };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  return {
    open,
    dispose() {
      cancel();
      panel?.destroy();
    },
    get busy() {
      return !!active;
    },
  };
}
module.exports = { installChatService };
