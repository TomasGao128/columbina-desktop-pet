const { BrowserWindow, ipcMain } = require("electron"),
  path = require("node:path");
function installControl({
  folder,
  getPet,
  getWeather,
  setWeather,
  openWeather,
}) {
  let panel = null,
    sequence = 0;
  const pending = new Map();
  function rpc(command) {
    return new Promise((resolve) => {
      const pet = getPet();
      if (!pet || pet.isDestroyed())
        return resolve({ ok: false, error: "桌宠窗口尚未就绪。" });
      const id = String(++sequence);
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, error: "桌宠暂未响应，请稍后重试。" });
      }, 4000);
      pending.set(id, { resolve, timer });
      pet.webContents.send("control-request", { id, command });
    });
  }
  ipcMain.on("control-response", (event, data) => {
    if (event.sender !== getPet()?.webContents) return;
    const item = pending.get(data?.id);
    if (!item) return;
    pending.delete(data.id);
    clearTimeout(item.timer);
    item.resolve(data);
  });
  async function request(event, command = { type: "state" }) {
    if (event.sender !== panel?.webContents)
      return { ok: false, error: "不允许访问控制面板。" };
    if (command?.type === "weather") {
      const result = setWeather({ ...getWeather(), ...command.value });
      if (!result.ok) return result;
    }
    if (command?.type === "weatherPanel") openWeather();
    const result = await rpc(
      ["weather", "weatherPanel"].includes(command?.type)
        ? { type: "state" }
        : command,
    );
    return { ...result, weather: getWeather() };
  }
  ipcMain.handle("control-command", request);
  function open() {
    if (panel && !panel.isDestroyed()) {
      panel.show();
      panel.focus();
      return;
    }
    panel = new BrowserWindow({
      width: 960,
      height: 760,
      minWidth: 700,
      minHeight: 580,
      title: "哥伦比娅 · 控制中心",
      autoHideMenuBar: true,
      backgroundColor: "#faf7fc",
      webPreferences: {
        preload: path.join(folder, "control-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    panel.webContents.on("will-navigate", (event) => event.preventDefault());
    panel.on("closed", () => {
      panel = null;
    });
    panel.loadFile(path.join(folder, "renderer/control.html"));
  }
  ipcMain.on("control-open", (event) => {
    if (event.sender === getPet()?.webContents) open();
  });
  return {
    open,
    dispose() {
      panel?.destroy();
      panel = null;
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.resolve({ ok: false, error: "桌宠已关闭。" });
      }
      pending.clear();
    },
  };
}
module.exports = { installControl };
