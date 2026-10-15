(() => {
  const {
    TUNING_RANGES,
    DEFAULT_TUNING,
    THEMES,
  } = require("../core/control-settings");
  function catalog() {
    return MENU.filter((g) =>
      ["动作", "姿势", "心情", "互动", "玩法", "换装秀"].includes(g.label),
    ).flatMap((g) =>
      g.items
        .filter((item) => typeof item.act === "function")
        .map((item) => ({
          id: g.label + ":" + item.label,
          label: item.label,
          group: g.label,
          icon: item.icon || "✦",
          locked: !!(
            item.contentKind &&
            item.contentId !== undefined &&
            !contentUnlocked(item.contentKind, item.contentId)
          ),
        })),
    );
  }
  const snapshot = () => ({
    scale: petScale,
    opacity: petOpacity,
    sound: soundOn,
    voice: voiceOn,
    voiceVolume,
    motes: motesOn,
    gaze: gazeTracking,
    reduced: reducedMotion,
    clickThrough,
    tuning: { ...controlTuning },
    favorites: [...controlFavorites],
    catalog: catalog(),
    menuLayout: [
      {
        id: "root",
        label: "主菜单",
        items: require("../core/menu-order")
          .orderedMenu(
            MENU.filter((g) => !g.sep),
            menuOrder.root,
          )
          .map((g) => g.label),
      },
      ...MENU.filter((g) => g.items).map((g) => ({
        id: "group:" + g.label,
        label: g.label + " · 子菜单",
        items: require("../core/menu-order")
          .orderedMenu(g.items, menuOrder["group:" + g.label])
          .map((it) => it.label),
      })),
    ],
  });
  ipcRenderer.on("control-request", (_event, request) => {
    try {
      const { type, key, value, id, group } = request.command || {};
      if (type === "menuOrder") {
        if (key === "reset") menuOrder = {};
        else {
          const layout = snapshot().menuLayout.find((g) => g.id === key);
          const policy = require("../core/menu-order");
          if (
            !layout ||
            !policy.validMenuOrder({ [key]: value }) ||
            value.length !== layout.items.length ||
            value.some((id) => !layout.items.includes(id))
          )
            throw Error("菜单顺序不正确。");
          menuOrder = { ...menuOrder, [key]: [...value] };
        }
        applyMenuOrder();
        saveSettings();
      } else if (type === "set") {
        const setters = {
          scale: setScale,
          opacity: setOpacity,
          voiceVolume: setVoiceVolume,
        };
        const limits = {
          scale: [0.1, 3.6],
          opacity: [0.3, 1],
          voiceVolume: [0, 1],
        };
        const booleans = {
          sound: setSound,
          voice: setVoiceOn,
          motes: setMotes,
          gaze: setGazeTracking,
          reduced: setReducedMotion,
          clickThrough: setClickThrough,
        };
        if (
          Object.hasOwn(setters, key) &&
          Number.isFinite(value) &&
          value >= limits[key][0] &&
          value <= limits[key][1]
        )
          setters[key](value);
        else if (Object.hasOwn(booleans, key) && typeof value === "boolean")
          booleans[key](value);
        else if (
          Object.hasOwn(TUNING_RANGES, key) &&
          Number.isFinite(value) &&
          value >= TUNING_RANGES[key][0] &&
          value <= TUNING_RANGES[key][1]
        ) {
          controlTuning = { ...controlTuning, [key]: value };
          saveSettings();
        } else throw Error("设置值不正确。");
      } else if (type === "action") {
        if (dragging || pendingDrag) throw Error("请先松开正在拖动的桌宠。");
        const record = catalog().find((item) => item.id === id);
        if (!record) throw Error("找不到这个动作。");
        if (record.locked) throw Error("这个动作尚未解锁。");
        const menu = MENU.find((g) => g.label === record.group);
        hideMenus();
        menu.items
          .find((item) => record.id === record.group + ":" + item.label)
          .act();
      } else if (type === "favorite") {
        if (
          typeof id !== "string" ||
          (!controlFavorites.includes(id) &&
            !catalog().some((item) => item.id === id) &&
            !(id.startsWith("weather:") && Object.hasOwn(THEMES, id.slice(8))))
        )
          throw Error("收藏项不正确。");
        if (controlFavorites.includes(id))
          controlFavorites = controlFavorites.filter((item) => item !== id);
        else {
          if (controlFavorites.length >= 40)
            throw Error("最多收藏 40 项，请先移除一些。");
          controlFavorites = [...controlFavorites, id];
        }
        saveSettings();
      } else if (type === "reset") {
        if (group === "appearance") {
          setScale(DEFAULT_SCALE);
          setOpacity(1);
          setMotes(true);
          setReducedMotion(false);
          setClickThrough(true);
        } else if (group === "sound") {
          setSound(true);
          setVoiceOn(true);
          setVoiceVolume(0.75);
        } else if (group === "tuning") {
          controlTuning = { ...DEFAULT_TUNING };
          setGazeTracking(true);
        } else throw Error("请选择要恢复的设置组。");
      } else if (type === "stop") {
        cancelAction();
        voiceDirector.stop();
      } else if (type !== "state") throw Error("不支持这个操作。");
      ipcRenderer.send("control-response", {
        id: request.id,
        ok: true,
        state: snapshot(),
      });
    } catch (error) {
      ipcRenderer.send("control-response", {
        id: request.id,
        ok: false,
        error: error.message,
      });
    }
  });
})();
