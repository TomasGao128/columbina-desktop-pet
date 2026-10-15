// 哥伦比娅桌宠主进程。
// 使用根目录 VBS/CMD 启动器运行 runtime/electron.exe app/main.js。
// 路径基于 __dirname 解析，功能模块分别位于 core/ 与 renderer/。

const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  nativeImage,
  Menu,
} = require("electron");
const { BurstWindow } = require("./burst-window");
const { sanitize } = require("./settings-schema"); // 设置白名单与校验（可被单元测试直接断言）
const path = require("path");
const fs = require("fs");
const { bodyHit } = require("./core/body-hit");
const { recoverPosition, walkBounds } = require("./core/display-layout");

const APP_DIR = __dirname; // <项目>\app
const ROOT_DIR = path.resolve(APP_DIR, ".."); // <项目>
const RENDERER_HTML = path.join(APP_DIR, "renderer", "index.html");
const POS_FILE = path.join(APP_DIR, "pet-position.json");
const LEGACY_POS_FILE = path.join(ROOT_DIR, "pet-position.json");
const SETTINGS_FILE = path.join(APP_DIR, "settings.json");
const ERROR_LOG = path.join(APP_DIR, "error.log");
const TRAY_ICON = path.join(APP_DIR, "pet-face.ico");

const { edgePeekX } = require("./core/edge-peek");
let dockSide = null;
let win = null;
let tray = null;
let burstWindow = null;
const weatherService = require("./weather-service").installWeather({
  folder: APP_DIR,
  getPet: () => win,
  log: logError,
});
let invalidateScaleAnchor = () => {};
const controlService = require("./control-service").installControl({
  folder: APP_DIR,
  getPet: () => win,
  getWeather: () => weatherService.status.config,
  setWeather: (input) => weatherService.set(input),
  openWeather: () => weatherService.open(),
});
// 渲染层最近一次上报的「宠物中心相对窗口左上角」的偏移。
// 贴边吸附和走动的边界都要用它把「宠物中心」换算成窗口坐标。
let lastStyle = { offX: 0, offT: 0 };

function logError(where, err) {
  const line = `[${new Date().toISOString()}] ${where}: ${(err && err.stack) || err}\n`;
  try {
    fs.appendFileSync(ERROR_LOG, line);
  } catch (e) {}
  console.error(line.trim());
}

// ===== 用户偏好（大小/透明度/音效）=====
// 渲染层启动时用 sendSync 同步取一次，改了之后异步写回。
// 放在模块作用域注册，避免渲染层 reload 时重复注册 handler。
let settingsCache;
function readSettings() {
  if (settingsCache !== undefined) return settingsCache;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
      if (s && typeof s === "object") return (settingsCache = s);
    }
  } catch (e) {
    logError("read-settings", e);
  }
  return (settingsCache = {});
}

ipcMain.on("get-pet-settings", (event) => {
  event.returnValue = readSettings();
});

// 台词数据：由 scripts/build-persona.mjs 从 docs/knowledge/persona.md 生成。
// 路径与文件访问都留在主进程，渲染层只管拿对象（渲染层做路径体操容易踩 __dirname 的坑）。
// 读失败返回 null，渲染层会退回它内置的那份台词兜底 —— 绝不因为一个 JSON 读不出来就让桌宠变哑。
let personaCache;
function readPersona() {
  if (personaCache !== undefined) return personaCache;
  try {
    personaCache = JSON.parse(
      fs.readFileSync(path.join(__dirname, "persona.json"), "utf8"),
    );
  } catch (e) {
    logError("read-persona", e);
    personaCache = null;
  }
  return personaCache;
}
ipcMain.on("get-persona", (event) => {
  event.returnValue = readPersona();
});
ipcMain.on("save-pet-settings", (_event, incoming) => {
  // 校验规则在 app/settings-schema.js（独立模块，可被 scripts/test-settings.mjs 直接断言）。
  // 这里不再自己列白名单 —— 以前把规则写在这个处理器里，只有跑起 Electron 才能碰到它。
  const next = sanitize(incoming, readSettings());
  settingsCache = next;
  try {
    fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(next, null, 2)}\n`);
  } catch (e) {
    logError("save-settings", e);
  }
});

function savePos() {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  try {
    fs.writeFileSync(POS_FILE, JSON.stringify({ x, y, edge: dockSide }));
  } catch (e) {
    logError("save-pos", e);
  }
}

function petDisplay() {
  const [x, y] = win.getPosition();
  return screen.getDisplayNearestPoint({
    x: Math.round(x + lastStyle.offX),
    y: Math.round(y + lastStyle.offT),
  });
}

// ===== 贴边吸附 =====
// Use the supplied leaning poses and calibrated cuts, rather than bisecting the face.
// Main moves the full sprite partly outside the work area; renderer never crops the image.
const SNAP_DIST = 60; // 宠物中心离屏幕边缘小于这个距离就吸附
let edgeSlide = null;
function stopEdgeSlide() {
  clearInterval(edgeSlide);
  edgeSlide = null;
}

function snapToEdge() {
  stopEdgeSlide();
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const area = petDisplay().workArea;
  const petCenterX = x + lastStyle.offX;
  let targetX = null;
  let side = null;
  if (petCenterX <= area.x + SNAP_DIST) {
    targetX = edgePeekX("left", area, lastStyle.offX);
    side = "left";
  } else if (petCenterX >= area.x + area.width - SNAP_DIST) {
    targetX = edgePeekX("right", area, lastStyle.offX);
    side = "right";
  }
  if (targetX === null) return;
  dockSide = side;
  win.webContents.send("pet-edge-snapped", side);
  if (Math.abs(targetX - x) < 2) return; // 已经贴着了，别每次松手都微调 1px
  if (readSettings().reducedMotion) {
    win.setPosition(targetX, y);
    invalidateScaleAnchor();
    return;
  }
  const started = Date.now();
  edgeSlide = setInterval(() => {
    if (!win || win.isDestroyed() || dockSide !== side) {
      stopEdgeSlide();
      return;
    }
    const t = Math.min(1, (Date.now() - started) / 160),
      eased = 1 - Math.pow(1 - t, 3);
    win.setPosition(Math.round(x + (targetX - x) * eased), y);
    invalidateScaleAnchor();
    if (t === 1) {
      stopEdgeSlide();
      savePos();
    }
  }, 16);
}

// ===== 光标坐标单位（结论见下，别再折腾）=====
// 实测（2026-10-07 用调试快照打出换算链确认）：
//   screen.getCursorScreenPoint() → **已经是 DIP**，和 win.getPosition()/setPosition() 同一单位。
//   screen.screenToDipPoint() 会**再除一次** scaleFactor → 用它反而错 1.25 倍。
// 我曾据此"修"过一次单位，结果把命中判定改坏：窗口在人物上时也判定为"在人物外"，
// 穿透一直开着 → 桌宠点不动（症状和当初 z-index 那个 bug 一模一样）。
// 教训：单位这种事必须**打出原始值**来确认，不能靠推理；而且要用一个
// 「调用方声明了 DPI 感知」的进程去设光标，否则 SetCursorPos 走的是虚拟化坐标，
// 两边一比就会得出"Electron 返回物理像素"的错误结论。
function cursorDip() {
  return screen.getCursorScreenPoint();
}

// 调试用：把"原始光标值 / 折算后的值 / 缩放因子"一起打出来。
// 本机实测 getCursorScreenPoint() 返回物理像素，而窗口位置是 DIP，
// 这里把整条换算链暴露出来，避免再对单位做猜测。
function cursorDebugInfo() {
  const raw = screen.getCursorScreenPoint();
  const dip = screen.screenToDipPoint(raw);
  const disp = screen.getDisplayNearestPoint(
    dip.x === raw.x && dip.y === raw.y ? raw : dip,
  );
  return {
    raw: [raw.x, raw.y],
    dip: [Math.round(dip.x), Math.round(dip.y)],
    scale: disp.scaleFactor,
  };
}

// 单实例：重复双击图标时不再起第二只桌宠，而是把已有那只显示出来。
// 没有这个锁的话，用户双击两次就会得到两个重叠的窗口，拖拽和位置互相打架。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win && !win.isDestroyed()) {
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(createWindow)
    .catch((e) => logError("whenReady", e));
}

// 首次运行时把老的根目录位置文件迁过来，保住用户上次拖到的位置
function readSavedPosition() {
  for (const file of [POS_FILE, LEGACY_POS_FILE]) {
    try {
      if (!fs.existsSync(file)) continue;
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (
        Number.isFinite(Number(saved.x)) &&
        Number.isFinite(Number(saved.y))
      ) {
        return {
          x: Number(saved.x),
          y: Number(saved.y),
          edge: ["left", "right"].includes(saved.edge) ? saved.edge : null,
        };
      }
    } catch (e) {}
  }
  return null;
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  // 默认缩放 140%（见 index.html 的 DEFAULT_SCALE），宠物 220*1.4=308。
  // 窗口尺寸要按「宠物四周留够余量」算（左边 44 / 下边 70 / 头顶 70，右边够放分栏），
  // 因为菜单以宠物中心为基准展开。改默认缩放时这里要跟着改。
  const WIN_W = 396,
    WIN_H = 448;
  // 至少留多少像素在屏幕内。贴边吸附会把窗口放到屏幕外一半（宠物中心正好压屏幕边），
  // 所以这里的下限必须允许负坐标，否则重启后吸附状态会被"钳"回屏幕里。
  // 但也不能完全不管：一旦存进去一个彻底在屏幕外的坐标（换分辨率、旧版本算错留下的坏值），
  // 用户就再也点不到桌宠了。
  const KEEP_VISIBLE = 120;
  let startX = Math.round(width / 2 - 200);
  let startY = Math.round(height / 2 - 250);
  const saved = readSavedPosition();
  if (saved) {
    dockSide = saved.edge;
    const bounds = { ...saved, width: WIN_W, height: WIN_H };
    const position = recoverPosition(
      bounds,
      screen.getDisplayMatching(bounds).workArea,
    );
    startX = position.x;
    startY = position.y;
  } else {
    startX += display.workArea.x;
    startY += display.workArea.y;
  }

  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    // 关掉用户侧的缩放/最大化：无边框置顶窗口在拖到屏幕上缘时会被系统当成
    // Aero Snap 触发最大化，窗口一旦被系统改尺寸，宠物中心就跟着跑偏。
    // 这些开关只挡「用户操作」，主进程自己的 setSize/setBounds 依然生效。
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    x: startX,
    y: startY,
    webPreferences: {
      // 渲染层通过本地经典脚本使用 electron，并调用 ipcRenderer.sendSync。
      // 换掉这两个开关会让整个 index.html 第一行就抛错、桌宠变成一块粉色方块。
      nodeIntegration: true,
      contextIsolation: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  burstWindow = new BurstWindow(() => win, logError);
  ipcMain.handle("burst-start", (event, payload) => {
    if (
      event.sender !== win.webContents ||
      !payload ||
      !Number.isSafeInteger(payload.id) ||
      payload.id < 1
    )
      return false;
    return burstWindow.start(payload);
  });
  ipcMain.on("burst-cancel", (event, id) => {
    if (
      win &&
      event.sender === win.webContents &&
      burstWindow.session?.id === id
    )
      burstWindow.stop("canceled");
  });

  win.loadFile(RENDERER_HTML).catch((e) => logError("loadFile", e));
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    logError("did-fail-load", `${code} ${desc} ${url}`);
  });

  // 把渲染层的报错转发到 error.log。
  // 渲染层异常原本是**完全看不见的**：主进程不会崩、窗口照样画出来，
  // 但如果脚本在开头就抛了异常，后面所有 handler 都不会挂上，
  // 用户看到的现象只是"点什么都没反应"，排查时毫无线索。
  win.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      // 过滤掉 Electron 在"未打包"状态下的固定 CSP 告警：页面确实没有 CSP meta，
      // 它每次启动都会来一条，留着只会把真正的报错淹掉。
      if (level >= 2 && !/Insecure Content-Security-Policy/.test(message)) {
        logError("renderer", `${message}  (${sourceId}:${line})`);
      }
    },
  );

  // 调试快照：PET_DEBUG=1 时每 3 秒问一次渲染层的内部状态，写进 error.log。
  // 排查"点了没反应"这类问题时，这是唯一能看到渲染层内部的办法。
  // 注意把**主进程侧真实生效的穿透状态**也带上：渲染层报的只是它自己的镜像，
  // 一旦两边不同步，只看渲染层会得出错误结论。
  let lastIgnore = null; // 主进程侧真实设过的穿透状态（渲染层报的只是它自己的镜像）
  // 只在状态翻转时才调用系统 API，避免每 33ms 都去动一次窗口
  function setIgnoreMouse(next) {
    if (!win || win.isDestroyed() || next === lastIgnore) return;
    lastIgnore = next;
    win.setIgnoreMouseEvents(next, { forward: true });
  }
  if (process.env.PET_DEBUG === "1") {
    ipcMain.on("debug-report", (_e, snapshot) => {
      logError(
        "debug",
        JSON.stringify({
          ...snapshot,
          winIgnore: lastIgnore,
          winPos: win.getPosition(),
          winSize: win.getSize(),
        }),
      );
    });
    setInterval(() => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("debug-request");
        // 调试模式：让渲染层禁止自主走动。
        // ⚠️ 必须随轮询**反复**发 —— 一次性的 setTimeout 可能在页面脚本注册好监听器
        // 之前就发出去了，消息直接丢掉，表现为"禁走动没生效、窗口还是被走位"（本轮实测踩到）。
        win.webContents.send("debug-mode");
      }
    }, 1000); // 调试模式下 1 秒采一次快照，自动化脚本才等得起（正常运行时 3 秒）
    // 合成点击在真实环境里不可靠（DPI/自主走动/坐标单位都会干扰），
    // 所以给调试模式配一个"让渲染层主动存一次盘"的触发，
    // 用来确定性地验证设置（含好感度）的读/写往返。
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.webContents.send("debug-save");
    }, 6000);
    // 12 秒时模拟一次互动：验证「睡着 → 醒来」这条路径。
    // 用确定性的触发而不是合成点击 —— 后者在真实环境里不可靠（本轮已多次踩到）。
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.webContents.send("debug-touch");
    }, 12000);
  }
  win.webContents.on("render-process-gone", (_e, details) => {
    logError("render-process-gone", JSON.stringify(details));
  });
  win.webContents.on("preload-error", (_e, preloadPath, err) => {
    logError("preload-error", `${preloadPath} ${err}`);
  });

  // 以启动时的实际尺寸为基准。实测拖拽过程中这个窗口会被越拖越大
  // （渲染层视口和窗口矩形的尺寸同步互相追，拖得越快越多），必须按基准拉回来，
  // 否则窗口的可点击区域会不断膨胀。
  let baseSize = win.getSize();

  ipcMain.on("get-pet-edge", (event) => {
    event.returnValue = dockSide;
  });
  ipcMain.on("ensure-pet-visible", (event) => {
    if (event.sender !== win?.webContents) return;
    const bounds = win.getBounds(),
      area = petDisplay().workArea;
    const position = recoverPosition(bounds, area);
    if (bounds.x !== position.x || bounds.y !== position.y) {
      win.setPosition(position.x, position.y);
      invalidateScaleAnchor();
    }
  });
  ipcMain.on("release-pet-edge", (event, move) => {
    if (event.sender !== win?.webContents) {
      event.returnValue = false;
      return;
    }
    stopEdgeSlide();
    const previous = dockSide;
    dockSide = null;
    if (previous && move !== false) {
      const area = petDisplay().workArea;
      const [x, y] = win.getPosition();
      const [windowWidth] = win.getSize();
      const target =
        previous === "left" ? area.x : area.x + area.width - windowWidth;
      win.setPosition(Math.round(target), y);
    }
    invalidateScaleAnchor();
    savePos();
    event.returnValue = true;
  });
  // 松手时才保存位置
  ipcMain.on("save-pos", savePos);

  // 托盘：图标从宠物本体取，右键菜单给显示/隐藏和退出
  const icon = nativeImage
    .createFromPath(TRAY_ICON)
    .resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  const trayMenu = Menu.buildFromTemplate([
    {
      label: "显示/隐藏",
      click: () => {
        if (win.isVisible()) {
          burstWindow.stop("hidden");
          win.hide();
        } else win.show();
      },
    },
    {
      label: "回到右下角",
      click: () => {
        dockSide = null;
        win.webContents.send("pet-edge-cleared");
        const [w, h] = win.getSize();
        const area = petDisplay().workArea;
        win.setPosition(area.x + area.width - w, area.y + area.height - h);
        invalidateScaleAnchor();
        savePos();
      },
    },
    { label: "收起光翼", click: () => burstWindow.stop("canceled") },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]);
  tray.setToolTip("哥伦比娅");
  tray.on("right-click", () => tray.popUpContextMenu(trayMenu));

  // 拖拽：让桌宠中心始终贴住光标。
  // 窗口位置 = 光标 − 宠物中心相对窗口的偏移。偏移由渲染层**每一步现算**并随更新送来。
  //
  // 为什么不能缓存偏移、也不能用 win.getSize() 推算：
  // 实测拖动过程中这个窗口会被莫名放大（渲染层的视口尺寸和窗口矩形尺寸两种变化都出现过），
  // 一旦偏移过期，宠物中心就不再落在光标上，表现为"拖得越久越往下沉"。
  // 只有每步现算才与当前布局一致。
  // 用「绝对定位」而不是「起点+位移」还有额外好处：没有起点锚点，就没有可累积的误差。
  // screen.getCursorScreenPoint() 与 getPosition/setPosition 同为 DIP，不需要折算。
  let dragActive = false;
  let strokeInputCapture = false;
  ipcMain.on("stroke-capture", (event, value) => {
    if (event.sender === win?.webContents) {
      strokeInputCapture = value === true;
      if (strokeInputCapture) setIgnoreMouse(false);
    }
  });
  win.webContents.on("did-start-loading", () => {
    strokeInputCapture = false;
  });
  ipcMain.on("drag-begin", () => {
    stopEdgeSlide();
    burstWindow.stop("drag");
    dragActive = true;
  });
  ipcMain.on("drag-cancel", () => {
    dragActive = false;
  });
  ipcMain.on("drag-update", (_event, offset) => {
    if (!dragActive || !offset) return;
    if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) return;
    const [w, h] = win.getSize();
    if (w !== baseSize[0] || h !== baseSize[1])
      win.setSize(baseSize[0], baseSize[1], false);
    const cursor = cursorDip();
    win.setPosition(
      Math.round(cursor.x - offset.x),
      Math.round(cursor.y - offset.y),
    );
    const area = petDisplay().workArea;
    const { edgeProgress } = require("./core/interaction-feel");
    const progress = edgeProgress(cursor.x, area.x, area.width);
    win.webContents.send("pet-edge-preview", {
      side:
        progress > 0
          ? cursor.x < area.x + area.width / 2
            ? "left"
            : "right"
          : null,
      progress,
    });
    invalidateScaleAnchor();
  });
  ipcMain.on("drag-end", () => {
    dragActive = false;
    snapToEdge(); // 松手先看要不要贴边，再记录最终落点
    savePos();
  });

  ipcMain.on("reset-pos", () => {
    stopEdgeSlide();
    burstWindow.stop("reset-position");
    dockSide = null;
    win.webContents.send("pet-edge-cleared");
    // 按实际窗口尺寸算，别写死 400/500
    const [w, h] = win.getSize();
    const area = petDisplay().workArea;
    win.setPosition(area.x + area.width - w, area.y + area.height - h);
    invalidateScaleAnchor();
    savePos();
  });

  // 点击穿透：窗口是 396x448 的矩形，但人物只占中间一块，四周全是透明区。
  // 不处理的话整块矩形都会吃掉点击 —— 用户点桌面图标、拖别的窗口都会被这块
  // "看不见的玻璃"挡住（同类项目踩过这个坑）。由渲染层判断鼠标是否压在
  // 人物或菜单上，这里只负责切换。
  //
  // forward:true 是关键：窗口忽略鼠标事件后，**移动**事件仍然会转发给渲染层。
  // 去掉它渲染层就再也收不到 mousemove，也就永远没法把穿透切回来，
  // 桌宠会变成一块点不动的死区。
  ipcMain.on("set-ignore-mouse", (_event, ignore) => {
    if (!win || win.isDestroyed()) return;
    setIgnoreMouse(!!ignore);
  });

  // ===== 点击穿透：以主进程为准，按光标位置定时自算 =====
  // 为什么不靠渲染层的 mousemove：实测 setIgnoreMouseEvents(true, {forward:true}) 的
  // 转发并不可靠 —— 一旦进入穿透状态，mousemove 可能再也送不进渲染层，渲染层就永远
  // 没法把穿透切回去，桌宠直接变成"点不动"。用户报的"点身体没反应"就是这么来的。
  // 这里每 33ms 用 getCursorScreenPoint() 自己算一次是否压在人物上，
  // 状态永远能在 33ms 内自愈；菜单打开时强制不穿透。
  let currentBodyMask = null;
  let sceneHitMask = null;
  let activityUiBox = null;
  let activityInputCapture = false;
  ipcMain.on("pet-activity-capture", (event, active) => {
    if (event.sender !== win?.webContents) {
      event.returnValue = false;
      return;
    }
    activityInputCapture = active === true;
    if (activityInputCapture) setIgnoreMouse(false);
    event.returnValue = true;
  });
  win.on("blur", () => {
    activityInputCapture = false;
  });
  win.webContents.on("did-start-loading", () => {
    activityInputCapture = false;
    activityUiBox = null;
    sceneHitMask = null;
  });
  win.webContents.on("render-process-gone", () => {
    activityInputCapture = false;
    activityUiBox = null;
    sceneHitMask = null;
  });
  ipcMain.on("pet-activity-ui", (event, box) => {
    if (event.sender !== win?.webContents) return;
    if (!box) {
      activityUiBox = null;
      return;
    }
    if (
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0 ||
      box.width > 4096 ||
      box.height > 4096
    )
      return;
    activityUiBox = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  });
  function acceptHitMask(event, mask, scene = false) {
    if (event.sender !== win?.webContents) return;
    if (!mask) {
      if (scene) sceneHitMask = null;
      else currentBodyMask = null;
      return;
    }
    if (
      mask.size !== 128 ||
      !Array.isArray(mask.pixels) ||
      mask.pixels.length !== 16384 ||
      ![mask.cx, mask.cy, mask.width, mask.height, mask.angle].every(
        Number.isFinite,
      ) ||
      mask.width <= 0 ||
      mask.height <= 0 ||
      mask.width > 4096 ||
      mask.height > 4096
    )
      return;
    const decoded = { ...mask, pixels: Uint8Array.from(mask.pixels) };
    if (scene) sceneHitMask = decoded;
    else currentBodyMask = decoded;
  }
  const recoverDisplay = () => {
    if (!win || win.isDestroyed()) return;
    burstWindow.stop("display-changed");
    dockSide = null;
    win.webContents.send("pet-edge-cleared");
    const bounds = win.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const position = recoverPosition(bounds, area);
    win.setPosition(position.x, position.y);
    invalidateScaleAnchor();
    savePos();
    win.webContents.send("display-layout-changed");
  };
  for (const event of ["display-removed", "display-metrics-changed"])
    screen.on(event, recoverDisplay);
  win.once("closed", () => {
    for (const event of ["display-removed", "display-metrics-changed"])
      screen.removeListener(event, recoverDisplay);
  });
  let menuOpen = false;
  ipcMain.on("menu-state", (_event, open) => {
    menuOpen = !!open;
  });

  ipcMain.on("pet-body-mask", (event, mask) => acceptHitMask(event, mask));
  ipcMain.on("pet-scene-mask", (event, mask) =>
    acceptHitMask(event, mask, true),
  );
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const [wx, wy] = win.getPosition();
    const c = cursorDip(); // Electron 光标与窗口位置均为 DIP
    if (readSettings().clickThrough === false) {
      setIgnoreMouse(false);
      return;
    }
    if (menuOpen || dragActive || strokeInputCapture || activityInputCapture) {
      setIgnoreMouse(false);
      return;
    }
    const px = c.x - wx,
      py = c.y - wy;
    const controlsHit =
      activityUiBox &&
      px >= activityUiBox.x &&
      px <= activityUiBox.x + activityUiBox.width &&
      py >= activityUiBox.y &&
      py <= activityUiBox.y + activityUiBox.height;
    const inside =
      bodyHit(currentBodyMask, px, py) ||
      bodyHit(sceneHitMask, px, py) ||
      controlsHit;
    if (process.env.PET_DEBUG === "1" && inside !== lastIgnore) {
      logError(
        "debug-hit",
        JSON.stringify({
          inside,
          cursor: cursorDebugInfo(),
          win: [wx, wy],
          offX: lastStyle.offX,
          offT: lastStyle.offT,
          bodyMask: !!currentBodyMask,
        }),
      );
    }
    setIgnoreMouse(!inside);
  }, 33);

  let lastCompanionCursor = "";
  const sendCompanionCursor = () => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const [x, y] = win.getPosition(),
      point = cursorDip();
    win.webContents.send("companion-cursor", {
      x: point.x - x,
      y: point.y - y,
    });
  };
  ipcMain.on("request-companion-cursor", (event) => {
    if (win && !win.isDestroyed() && event.sender === win.webContents)
      sendCompanionCursor();
  });
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const [x, y] = win.getPosition(),
      point = cursorDip(),
      key = [x, y, point.x, point.y].join(",");
    if (key !== lastCompanionCursor) {
      lastCompanionCursor = key;
      sendCompanionCursor();
    }
  }, 33);

  // 自主走动的一小步位移。放主进程算：要用窗口当前位置和工作区宽度，并且夹住不让它走出屏幕。
  // 同步返回是否撞到左/右边界，渲染层据此掉头。
  //
  // 走动目标位置在这里自己记账（walkX），不每步从实际位置反推：
  // 150% 缩放下 1 DIP = 1.5 物理像素，奇数 DIP 位置无法精确表示会被系统吸附，
  // 反推的话每步会丢掉一部分（实测 3px 的步长实际只走了约 2px）。
  // 配合渲染层把步长取偶数（4 DIP = 整数物理像素），位移就是精确的。
  let walkX = null;
  // 一次走动开始：以当前实际位置为基准，并把左右两边各剩多少空间回报给渲染层
  // （渲染层据此挑一个能走完全程的方向 —— 左右是两套动作，一次走动只能用一个方向，不能到边掉头）
  ipcMain.on("walk-begin", (event) => {
    const [x, y] = win.getPosition();
    const [w] = win.getSize();
    const area = petDisplay().workArea;
    const { minX, maxX } = walkBounds(area, lastStyle.offX, w);
    walkX = x;
    // 顺带回报"光标离宠物中心多远"（DIP）：渲染层拿它决定这一轮要不要走。
    // 复用这条现成通道，不额外加轮询 —— 渲染层每个决策周期只问一次。
    // 注意 getCursorScreenPoint() 已是 DIP，和 getPosition() 同单位，不要再折算。
    const cur = screen.getCursorScreenPoint();
    const dist = Math.hypot(
      cur.x - (x + lastStyle.offX),
      cur.y - (y + lastStyle.offT),
    );
    event.returnValue = {
      x,
      maxX,
      leftRoom: x - minX,
      rightRoom: maxX - x,
      cursorDist: Math.round(dist),
    };
  });
  ipcMain.on("walk-step-sync", (event, dx) => {
    const [x, y] = win.getPosition();
    const [w] = win.getSize();
    const area = petDisplay().workArea;
    const { minX, maxX } = walkBounds(area, lastStyle.offX, w);
    if (walkX === null) walkX = x;
    walkX = Math.max(minX, Math.min(walkX + Math.round(Number(dx) || 0), maxX));
    if (walkX !== x) {
      win.setPosition(walkX, y);
      invalidateScaleAnchor();
    }
    event.returnValue = {
      x: walkX,
      hitLeft: walkX <= minX,
      hitRight: walkX >= maxX,
    };
  });

  // 缩放由渲染层发起，**以宠物中心为锚点**：宠物绕自己中心长大缩小，不会往右上"长出去"。
  // 渲染层只报「中心相对窗口的偏移」和目标窗口尺寸；锚点（宠物中心的屏幕坐标）在这里记账。
  //
  // 两个坑：
  //  1) 锚点必须自己记账、**不能每步从实际窗口位置反推** —— 150% 缩放下 1 DIP = 1.5 物理像素，
  //     奇数 DIP 位置无法精确表示，setBounds 会被吸附，反推就会每步丢 1px 并逐次累积
  //     （实测拖滑块来回几次窗口位置从 480 漂到 476）。
  //  2) 位置/尺寸都吸附到**偶数 DIP** —— 偶数 DIP × 1.5 必为整数物理像素，可以精确表示。
  // 这里也不钳 y：钳了就没法保持中心锚定（顶到屏幕上边时中心会往下掉）。
  const snapEven = (v) => Math.round(v / 2) * 2;
  let anchor = null; // Stable through scaling; refreshed after an intentional move.
  invalidateScaleAnchor = () => {
    anchor = null;
  };
  // 同步 IPC：渲染层改完 CSS 后立刻调这里，主进程在**同一个 JS 任务内**把窗口尺寸/位置也改掉。
  // 这样浏览器出帧时「宠物多大」和「窗口多大」永远一致 —— 用异步的话窗口会落后好几步，
  // 宠物已经变大、窗口还是旧尺寸，中心就错位，看起来就是乱动。
  ipcMain.on("apply-pet-style-sync", (_event, style) => {
    burstWindow.stop("resize");
    if (!style) {
      _event.returnValue = false;
      return;
    }
    const offX = Number(style.offX) || 0;
    const offT = Number(style.offYFromTop) || 0;
    const newW = Math.max(240, Math.round(style.winW || 0));
    const newH = Math.max(240, Math.round(style.winH || 0));
    const previousStyle = lastStyle;
    lastStyle = { offX, offT }; // 贴边吸附与走动边界都要用它做换算
    if (anchor === null) {
      // 首帧：用当前窗口位置定出锚点。**这里不要 return** ——
      // 下面还要按这个锚点把窗口尺寸对一次：用户如果记住过 200% 这类缩放，
      // 启动时窗口必须立刻长大，否则宠物会被 396x448 的初始窗口裁掉。
      // 默认缩放下算出来的位置与尺寸跟初始值一致，不会有可见位移。
      const [x0, y0] = win.getPosition();
      anchor = {
        x: x0 + (previousStyle.offX || offX),
        y: y0 + (previousStyle.offT || offT),
      };
    }
    const wantW = snapEven(newW),
      wantH = snapEven(newH);
    win.setBounds({
      x: snapEven(anchor.x - offX),
      y: snapEven(anchor.y - offT),
      width: wantW,
      height: wantH,
    });
    // 按住鼠标拖缩放滑块时，窗口会被系统悄悄放大（与拖拽移动窗口时是同一个现象，
    // 实测一次快拖下来会多出几十像素）。危害有两层：窗口被撑大，以及**宠物中心跑偏**
    // ——因为上面的 y 是按「目标高度」算的，实际变高后中心就跟着下移。
    // 这里核对实得尺寸：对不上就拉回目标尺寸，并按实得高度再纠一次位置。
    const [aW, aH] = win.getSize();
    if (aW !== wantW || aH !== wantH) {
      win.setSize(wantW, wantH, false);
      // 顶边定位下位置不依赖窗口高度，纠正尺寸即可，不用再动位置
    }
    if (dockSide) {
      const area = petDisplay().workArea;
      const [, y] = win.getPosition();
      win.setPosition(edgePeekX(dockSide, area, offX), y);
      invalidateScaleAnchor();
    }
    baseSize = win.getSize(); // 拖拽的尺寸守卫要跟着更新，否则会被拉回旧尺寸
    _event.returnValue = true; // sendSync 必须回值
  });

  win.on("closed", () => {
    controlService.dispose();
    weatherService.dispose();
    stopEdgeSlide();
    burstWindow.stop("pet-closed");
    win = null;
  });
}

app.on("before-quit", () => {
  controlService.dispose();
  weatherService.dispose();
  burstWindow?.stop("quit");
});
app.on("window-all-closed", () => app.quit());

process.on("uncaughtException", (e) => logError("uncaughtException", e));
