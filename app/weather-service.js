const { BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs"),
  path = require("node:path");
const { normalize, layout } = require("./core/weather-policy");
function installWeather({ folder, getPet, log = () => {} }) {
  const file = path.join(folder, "weather-config.json");
  let config;
  try {
    config = normalize(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    config = normalize();
  }
  let panel = null,
    effect = null,
    last = "",
    state = { paused: true, reduced: false },
    disposed = false;
  const send = () => panel?.webContents.send("weather-settings", config);
  function refresh() {
    const pet = getPet();
    if (disposed || !pet || pet.isDestroyed()) return;
    if (config.theme === "off") {
      effect?.destroy();
      effect = null;
      last = "";
      return;
    }
    if (!effect) {
      effect = new BrowserWindow({
        width: 700,
        height: 600,
        show: false,
        transparent: true,
        frame: false,
        hasShadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        resizable: false,
        webPreferences: {
          preload: path.join(folder, "weather-preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      effect.setIgnoreMouseEvents(true);
      const current = effect;
      current.on("closed", () => {
        if (effect === current) {
          effect = null;
          last = "";
          config = { ...config, theme: "off" };
          send();
        }
      });
      current.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      current.webContents.on("will-navigate", (e) => e.preventDefault());
      current.webContents.once("did-finish-load", () => {
        last = "";
        refresh();
      });
      current.webContents.on("render-process-gone", () => {
        if (effect === current) {
          effect = null;
          last = "";
        }
        current.destroy();
        config = { ...config, theme: "off" };
        send();
      });
      current
        .loadFile(path.join(folder, "renderer/weather.html"), {
          query: { view: "effect" },
        })
        .catch((e) => {
          log("weather-load", e);
          config = { ...config, theme: "off" };
          current.destroy();
          if (effect === current) effect = null;
          send();
        });
    }
    const bounds = pet.getBounds(),
      area = screen.getDisplayMatching(bounds).workArea;
    const rect = layout(
      area,
      state.rect
        ? {
            x: bounds.x + state.rect.x,
            y: bounds.y + state.rect.y,
            width: state.rect.width,
            height: state.rect.height,
          }
        : {
            x: bounds.x + 44,
            y: bounds.y + 70,
            width: Math.max(80, bounds.width - 88),
            height: Math.max(100, bounds.height - 140),
          },
      config.range,
    );
    const paused = state.paused || !pet.isVisible() || pet.isMinimized();
    const payload = { ...config, reduced: state.reduced, paused };
    const key = JSON.stringify({ rect, payload });
    if (key !== last) {
      effect.setBounds(rect);
      effect.webContents.send("weather-render", payload);
      last = key;
    }
    if (paused) {
      if (effect.isVisible()) effect.hide();
    } else if (!effect.webContents.isLoading() && !effect.isVisible())
      effect.showInactive();
  }
  function open() {
    if (panel && !panel.isDestroyed()) {
      panel.show();
      panel.focus();
      return;
    }
    panel = new BrowserWindow({
      width: 510,
      height: 700,
      minWidth: 420,
      minHeight: 540,
      title: "哥伦比娅 · 天气氛围",
      autoHideMenuBar: true,
      backgroundColor: "#faf7fc",
      webPreferences: {
        preload: path.join(folder, "weather-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    panel.webContents.on("will-navigate", (e) => e.preventDefault());
    panel.on("closed", () => {
      panel = null;
    });
    panel.loadFile(path.join(folder, "renderer/weather.html"));
  }
  ipcMain.on("weather-open", (event) => {
    if (event.sender === getPet()?.webContents) open();
  });
  ipcMain.on("weather-pet-state", (event, value) => {
    if (event.sender !== getPet()?.webContents) return;
    state = {
      paused: value?.paused === true,
      reduced: value?.reduced === true,
      rect:
        value?.rect &&
        ["x", "y", "width", "height"].every(
          (k) =>
            Number.isFinite(value.rect[k]) && Math.abs(value.rect[k]) <= 4000,
        ) &&
        value.rect.width > 0 &&
        value.rect.height > 0
          ? value.rect
          : state.rect,
    };
    refresh();
  });
  ipcMain.handle("weather-get", (event) =>
    event.sender === panel?.webContents ? config : null,
  );
  function apply(input) {
    try {
      const next = normalize(input);
      fs.writeFileSync(file + ".tmp", JSON.stringify(next));
      fs.renameSync(file + ".tmp", file);
      config = next;
      refresh();
      send();
      return { ok: true, config };
    } catch {
      return { ok: false, error: "氛围设置保存失败，请检查文件夹是否可写。" };
    }
  }
  ipcMain.handle("weather-save", (event, input) =>
    event.sender === panel?.webContents ? apply(input) : { ok: false },
  );
  const timer = setInterval(refresh, 150);
  return {
    open,
    set: apply,
    dispose() {
      disposed = true;
      clearInterval(timer);
      effect?.destroy();
      effect = null;
      panel?.destroy();
      panel = null;
    },
    get status() {
      return { config: { ...config }, active: !!effect, paused: state.paused };
    },
  };
}
module.exports = { installWeather };
