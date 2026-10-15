(() => {
  const $ = (id) => document.getElementById(id),
    THEMES = {
      off: "关闭",
      rain: "细雨",
      wind: "微风",
      night: "晴夜",
      snow: "落雪",
      fireflies: "萤火",
      maple: "枫叶",
      blossom: "花雨",
      butterflies: "蝶舞",
    };
  const titles = {
    menu: ["菜单排序", "拖动条目或使用上下按钮，调整后立即保存。"],
    favorites: ["常用收藏", "收藏喜欢的搭配，下次一键调用。"],
    actions: ["动作与玩法", "复用现有动作，解锁规则与桌宠一致。"],
    weather: ["天气氛围", "切换后直接看桌宠周围的变化。"],
    settings: ["偏好设置", "调节会实时应用，可按组恢复默认。"],
  };
  let state = null,
    weather = null,
    tab = "favorites",
    search = "",
    group = "全部",
    menuGroup = "root",
    queue = Promise.resolve();
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  function perform(input, redraw = true) {
    queue = queue.then(async () => {
      try {
        const result = await control.command(input);
        if (!result.ok) throw Error(result.error || "操作失败。");
        state = result.state;
        weather = result.weather;
        if (redraw) render();
        $("status").textContent =
          input.type === "state"
            ? "已同步当前状态。"
            : input.type === "action"
              ? "已发送动作，可在桌宠上查看。"
              : "已应用并保存。";
      } catch (error) {
        $("status").textContent = error.message;
      }
    });
    return queue;
  }
  const button = (label, callback) => {
    const el = node("button", label);
    el.onclick = callback;
    return el;
  };
  function star(id) {
    const el = button(state.favorites.includes(id) ? "★" : "☆", () =>
      perform({ type: "favorite", id }),
    );
    el.className = "star";
    el.dataset.active = String(state.favorites.includes(id));
    el.setAttribute(
      "aria-label",
      (state.favorites.includes(id) ? "取消收藏" : "收藏") + id,
    );
    return el;
  }
  function card(item) {
    const el = node("article", undefined, "card");
    el.append(
      node("small", item.group),
      node("strong", (item.icon || "✦") + " " + item.label),
    );
    const foot = node("footer");
    const run = button(
      item.locked ? "尚未解锁" : item.theme ? "切换氛围" : "演示",
      () =>
        item.theme
          ? perform({
              type: "weather",
              value: { ...weather, theme: item.theme },
            })
          : perform({ type: "action", id: item.id }),
    );
    run.disabled = !!item.locked;
    foot.append(run, star(item.id));
    el.append(foot);
    return el;
  }
  function section(title, reset) {
    const el = node("div", undefined, "setting-section"),
      heading = node("div", undefined, "section-heading");
    heading.append(node("h2", title));
    if (reset) heading.append(button("恢复默认", () => reset()));
    el.append(heading);
    return el;
  }
  function slider(parent, key, label, value, min, max, step, format, send) {
    const row = node("div", undefined, "setting-row"),
      caption = node("label", label),
      out = node("output", format(value)),
      input = node("input");
    input.id = "control-" + key;
    input.type = "range";
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    caption.htmlFor = input.id;
    caption.append(out);
    let timer;
    const commit = () => {
      clearTimeout(timer);
      send(Number(input.value));
    };
    input.oninput = () => {
      out.textContent = format(Number(input.value));
      clearTimeout(timer);
      timer = setTimeout(commit, 120);
    };
    input.onchange = commit;
    row.append(caption, input);
    parent.append(row);
  }
  function toggle(parent, key, label, value) {
    const row = node("div", undefined, "setting-row"),
      caption = node("label", label),
      input = node("input");
    input.id = "control-" + key;
    input.type = "checkbox";
    input.checked = value;
    input.onchange = () =>
      perform({ type: "set", key, value: input.checked }, false);
    caption.append(input);
    row.append(caption);
    parent.append(row);
  }
  const percent = (n) => Math.round(n * 100) + "%";
  function settings() {
    const appearance = section("外观与显示", () =>
      perform({ type: "reset", group: "appearance" }),
    );
    slider(
      appearance,
      "scale",
      "角色大小",
      state.scale,
      0.1,
      3.6,
      0.1,
      percent,
      (value) => perform({ type: "set", key: "scale", value }, false),
    );
    slider(
      appearance,
      "opacity",
      "角色不透明度",
      state.opacity,
      0.3,
      1,
      0.1,
      percent,
      (value) => perform({ type: "set", key: "opacity", value }, false),
    );
    toggle(appearance, "motes", "角色周围的蓝色泡泡", state.motes);
    toggle(appearance, "reduced", "减弱动画", state.reduced);
    toggle(appearance, "clickThrough", "透明区域点击穿透", state.clickThrough);
    const sound = section("声音", () =>
      perform({ type: "reset", group: "sound" }),
    );
    toggle(sound, "sound", "互动音效", state.sound);
    toggle(sound, "voice", "本地互动与故事语音", state.voice);
    slider(
      sound,
      "voiceVolume",
      "语音音量",
      state.voiceVolume,
      0,
      1,
      0.05,
      percent,
      (value) => perform({ type: "set", key: "voiceVolume", value }, false),
    );
    sound.append(node("p", "头、胸、脚触碰和陪伴聊天仍不播放录音。", "help"));
    const tuning = section("互动手感", () =>
      perform({ type: "reset", group: "tuning" }),
    );
    toggle(tuning, "gaze", "看向鼠标", state.gaze);
    for (const [key, label, min, max] of [
      ["gazeSpeed", "视线跟随速度", 0.5, 2],
      ["dragAmount", "拖动倾斜幅度", 0, 1.5],
      ["peekAmount", "贴边探头幅度", 0, 1.5],
    ])
      slider(
        tuning,
        key,
        label,
        state.tuning[key],
        min,
        max,
        0.05,
        percent,
        (value) => perform({ type: "set", key, value }, false),
      );
    tuning.append(
      node(
        "p",
        "100% 为当前默认手感。拖动倾斜或探头调到 0% 可单独关闭该变化。",
        "help",
      ),
    );
    $("content").append(appearance, sound, tuning);
  }
  function menuSettings() {
    const content = $("content");
    const select = node("select");
    select.setAttribute("aria-label", "选择要排序的菜单");
    for (const layout of state.menuLayout) {
      const option = node("option", layout.label);
      option.value = layout.id;
      select.append(option);
    }
    select.value = menuGroup;
    select.onchange = () => {
      menuGroup = select.value;
      render();
    };
    content.append(
      select,
      button("恢复全部菜单默认顺序", () =>
        perform({ type: "menuOrder", key: "reset" }),
      ),
    );
    const layout =
      state.menuLayout.find((g) => g.id === menuGroup) || state.menuLayout[0];
    let dragged = null;
    const move = (from, to) => {
      if (from === to || to < 0 || to >= layout.items.length) return;
      const items = [...layout.items];
      items.splice(to, 0, items.splice(from, 1)[0]);
      perform({ type: "menuOrder", key: layout.id, value: items });
    };
    const list = node("div", undefined, "menu-order-list");
    layout.items.forEach((label, index) => {
      const row = node("div", undefined, "menu-order-row");
      row.draggable = true;
      row.ondragstart = (event) => {
        dragged = index;
        event.dataTransfer.setData("text/plain", String(index));
        event.dataTransfer.effectAllowed = "move";
      };
      row.ondragover = (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      };
      row.ondrop = (event) => {
        event.preventDefault();
        if (dragged !== null) move(dragged, index);
        dragged = null;
      };
      row.ondragend = () => {
        dragged = null;
      };
      const up = button("↑", () => move(index, index - 1));
      const down = button("↓", () => move(index, index + 1));
      up.disabled = index === 0;
      down.disabled = index === layout.items.length - 1;
      up.setAttribute("aria-label", "上移" + label);
      down.setAttribute("aria-label", "下移" + label);
      row.append(
        node("span", "⠿", "drag-handle"),
        node("span", label, "menu-order-label"),
        up,
        down,
      );
      list.append(row);
    });
    content.append(list);
  }
  function render() {
    if (!state) return;
    $("title").textContent = titles[tab][0];
    $("subtitle").textContent = titles[tab][1];
    for (const b of document.querySelectorAll("[data-tab]"))
      b.dataset.active = String(b.dataset.tab === tab);
    const content = $("content");
    content.replaceChildren();
    if (tab === "menu") {
      menuSettings();
      return;
    }
    if (tab === "settings") {
      settings();
      return;
    }
    const weatherItems = Object.entries(THEMES)
      .filter(([id]) => id !== "off")
      .map(([id, label]) => ({
        id: "weather:" + id,
        theme: id,
        label,
        group: "天气氛围",
        icon: "✧",
      }));
    if (tab === "weather") {
      const grid = node("div", undefined, "grid weather-grid");
      for (const item of weatherItems) {
        const el = card(item);
        if (weather.theme === item.theme) el.dataset.selected = "true";
        grid.append(el);
      }
      content.append(grid);
      const options = section("氛围调节", () =>
        perform({
          type: "weather",
          value: { theme: "off", range: 700, density: 55, brightness: 60 },
        }),
      );
      for (const [key, label, min, max, step] of [
        ["range", "特效范围", 360, 1200, 20],
        ["density", "疏密", 10, 100, 1],
        ["brightness", "亮度", 10, 100, 1],
      ])
        slider(
          options,
          "weather-" + key,
          label,
          weather[key],
          min,
          max,
          step,
          (value) => value + (key === "range" ? " px" : "%"),
          (value) =>
            perform({ type: "weather", value: { [key]: value } }, false),
        );
      options.append(
        button("关闭氛围", () =>
          perform({ type: "weather", value: { theme: "off" } }),
        ),
        button("打开独立氛围面板", () =>
          perform({ type: "weatherPanel" }, false),
        ),
      );
      content.append(options);
      return;
    }
    let items = state.catalog;
    if (tab === "favorites") {
      items = state.favorites
        .map((id) =>
          [...state.catalog, ...weatherItems].find((item) => item.id === id),
        )
        .filter(Boolean);
    }
    if (tab === "actions") {
      const filter = node("div", undefined, "filter"),
        query = node("input"),
        select = node("select");
      query.type = "search";
      query.placeholder = "搜索动作、姿势或玩法";
      query.value = search;
      query.setAttribute("aria-label", "搜索动作");
      for (const label of [
        "全部",
        ...new Set(state.catalog.map((item) => item.group)),
      ]) {
        const option = node("option", label);
        option.value = label;
        select.append(option);
      }
      select.value = group;
      select.setAttribute("aria-label", "动作分类");
      filter.append(query, select);
      content.append(filter);
      const grid = node("div", undefined, "grid");
      const draw = () => {
        grid.replaceChildren();
        for (const item of state.catalog.filter(
          (item) =>
            (group === "全部" || item.group === group) &&
            item.label.includes(search),
        ))
          grid.append(card(item));
      };
      query.oninput = () => {
        search = query.value;
        draw();
      };
      select.onchange = () => {
        group = select.value;
        draw();
      };
      draw();
      content.append(grid);
      return;
    }
    if (!items.length)
      content.append(
        node(
          "p",
          "还没有收藏。到「动作与玩法」或「天气氛围」点一下 ☆，就能把喜欢的留在这里。",
          "empty",
        ),
      );
    else {
      const grid = node("div", undefined, "grid");
      items.forEach((item) => grid.append(card(item)));
      content.append(grid);
    }
  }
  document.querySelectorAll("[data-tab]").forEach(
    (button) =>
      (button.onclick = () => {
        tab = button.dataset.tab;
        render();
      }),
  );
  $("stop").onclick = () => perform({ type: "stop" }, false);
  $("refresh").onclick = () => perform({ type: "state" });
  perform({ type: "state" });
})();
