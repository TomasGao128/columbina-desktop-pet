// ===== 碎碎念的台词 =====
// 全部摘自工程知识库 docs/knowledge/persona.md（逐字，未改写），
// 取其中的「彩蛋」「背景故事片段」「口头禅」「好奇」「感谢」几段 —— 这几段是自言自语的口吻，
// 正好当碎碎念用。要加台词就去那份知识库里挑，别在这里另编。
const CHATTER = [
  // 彩蛋
  "时间...是最温柔的东西",
  "梦...和现实一样美呢",
  "月光...是我的朋友哦",
  "歌...会让一切都温柔下来",
  "执行官...不过是虚名罢了",
  "我...来自至冬呢",
  "你...听到我的歌声了吗？",
  // 背景故事片段
  "时间对我来说...不是很重要呢",
  "我只是...在看着而已",
  "至冬的雪...下了很久很久",
  "大家都在忙碌着...只有我...时间很多",
  "我喜欢唱歌...唱摇篮曲",
  "月光...是最好的陪伴",
  "我以前...见过很多很多人",
  "只有月光...永远不变",
  "看世间的一切...像流水一样流过",
  // 口头禅
  "嗯...原来是这样呢",
  "时间...还很长呢",
  "不用那么着急哦",
  // 好奇
  "嗯...世界真奇妙呢",
  "我...想多了解一点",
  "有意思...让我看看",
  // 感谢
  "有你...真好",
  "嗯...我会记住的",
];

function sayChatter() {
  recordCompanionship("game", "chatter");
  addAffection(1);
  voiceDirector?.stop();
  if (!speakMatched("chatter"))
    showBubble(CHATTER[Math.floor(Math.random() * CHATTER.length)]);
}

const MENU = [
  {
    icon: "🎛️",
    label: "控制中心",
    act: () => ipcRenderer.send("control-open"),
  },
  {
    icon: "🌦️",
    label: "氛围",
    items: [
      {
        icon: "🌙",
        label: "天气氛围面板",
        act: () => ipcRenderer.send("weather-open"),
      },
    ],
  },
  {
    icon: "🎮",
    label: "玩法",
    items: [
      {
        icon: "✏️",
        label: "日常 · 一起做题",
        act: () => playroom.start("study"),
      },
      {
        icon: "🎮",
        label: "娱乐 · 节奏游戏",
        act: () => playroom.start("gaming"),
      },
      {
        icon: "🏀",
        label: "运动 · 月光篮球",
        act: () => playroom.start("basketball"),
      },
      {
        icon: "🐈",
        label: "场景 · 路边逗小黑",
        act: () => playroom.start("cat"),
      },
      {
        icon: "🌙",
        label: "场景 · 坐椅子看风景",
        act: () => playroom.start("scenery"),
      },
    ],
  },
  {
    icon: "💬",
    label: "互动",
    items: [
      { icon: "🤍", label: "安慰她", act: comfortPet },
      { icon: "💭", label: "看看她的心情", act: showPetMood, keepOpen: true },
      { icon: "🍰", label: "喂蛋糕", act: () => feed() },
      { icon: "🏸", label: "打羽毛球", act: () => playCompanion("badminton") },
      { icon: "🟣", label: "软球逗她", act: () => playCompanion("ball") },
      { icon: "🎵", label: "轻声唱歌", act: () => playCompanion("sing") },
      { icon: "🤏", label: "捏捏脸", act: () => playCompanion("pinch") },
      { icon: "🪶", label: "接住羽毛", act: () => playCompanion("feather") },
      { icon: "🤍", label: "轻拍肩膀", act: () => playCompanion("shoulder") },
      { icon: "💭", label: "碎碎念", act: () => sayChatter(), keepOpen: true }, // 不关菜单，方便连着点
      { icon: "📖", label: "故事", items: VOICE_CATALOG.stories },
    ],
  },
  {
    icon: "🎭",
    label: "动作",
    items: [
      { icon: "🚶", label: "向左走", act: () => playWalkLeft() },
      { icon: "🚶", label: "向右走", act: () => playWalkRight() },
      { icon: "🏃", label: "向左跑", act: () => playRunLeft() },
      { icon: "🏃", label: "向右跑", act: () => playRunRight() },
      // 动作与表情合并到同一栏
      { icon: "🪽", label: "月翼天穹", act: () => playMoonBurst() },
      { icon: "🌙", label: "颔首致意", act: () => playGentleBow() },
      { icon: "✨", label: "月光祈愿", act: () => playMoonWish() },
      { icon: "🎵", label: "静静聆听", act: () => playListen() },
      { icon: "😠", label: "生气跺脚", act: () => playStomp() },
      { icon: "🤭", label: "捂脸笑", act: () => playCoverLaugh() },
      { icon: "✌️", label: "比耶", act: () => playPeaceSign() },
      { icon: "👋", label: "打招呼", act: () => playWaveHello() },
      { icon: "😱", label: "惊讶捂嘴", act: () => playSurpriseMouth() },
      { icon: "🫂", label: "蹲下比心", act: () => playSitHeart() },
      { icon: "😉", label: "俏皮眨眼", act: () => playWink() },
      { icon: "😊", label: "开心托腮", act: () => playHappyCheeks() },
      { icon: "🤍", label: "托腮发呆", act: () => playRestChin() },
      { icon: "🥱", label: "打哈欠", act: () => playYawn() },
    ],
  },
  {
    icon: "🌸",
    label: "心情",
    items: [
      // 单帧定格表情，素材与台词见上面的 MOODS 表
      { icon: "🥰", label: "害羞", act: () => playMood("shy") },
      { icon: "😆", label: "大笑", act: () => playMood("laugh") },
      { icon: "😝", label: "吐舌", act: () => playMood("tongueOut") },
      { icon: "😤", label: "扭头生气", act: () => playMood("ignore") },
      { icon: "✌️", label: "双手比耶", act: () => playMood("wave") },
      { icon: "🌟", label: "为你加油", act: () => playMood("cheer") },
      { icon: "✨", label: "期待", act: () => playMood("expect") },
      { icon: "🙈", label: "捂脸", act: () => playMood("shyCover") },
      { icon: "🥺", label: "撒娇", act: () => playMood("coax") },
      { icon: "🌙", label: "想家了", act: () => playMood("sad") },
    ],
  },
  {
    icon: "🛋",
    label: "姿势",
    items: USER_POSES.map((p) => ({
      icon: p.icon,
      label: p.label,
      act: () => playUserPose(p.id),
    })),
  },
  {
    icon: '<svg class="wardrobe-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4c0-3 6-3 6 0 0 2-3 2-3 4M12 8 2 14v2h20v-2L12 8"/><path d="m8 12-2 9h12l-2-9"/></svg>',
    label: "换装秀",
    items: COSER_POSES.map((p) => ({
      icon: "👗",
      label: p.label,
      preview: p,
      contentKind: "coser",
      contentId: p.id,
      act: () => playCoserPose(p.id),
    })),
  },
  { icon: "🌙", label: "专注", act: () => openLifePanel("focus") },
  { icon: "🤍", label: "陪伴", act: () => openLifePanel("memory") },
  {
    icon: "📏",
    label: "大小",
    items: [
      {
        slider: true,
        min: SCALE_MIN,
        max: SCALE_MAX,
        step: SCALE_STEP,
        get: () => petScale,
        set: (v) => setScale(v),
        format: (v) => Math.round(v * 100) + "%",
      },
      {
        presets: [0.5, 1, DEFAULT_SCALE, 2, 3, SCALE_MAX],
        get: () => petScale,
        set: (v) => setScale(v),
      },
      {
        icon: "↺",
        label: "恢复默认",
        act: () => {
          setScale(DEFAULT_SCALE);
          syncSliderUI(subMenu, petScale);
        },
        keepOpen: true,
      },
    ],
  },
  {
    icon: "👻",
    label: "透明",
    items: [
      {
        slider: true,
        min: OPACITY_MIN,
        max: 1,
        step: 0.1,
        get: () => petOpacity,
        set: (v) => setOpacity(v),
        format: (v) => Math.round(v * 100) + "%",
      },
      {
        icon: "↺",
        label: "恢复默认",
        act: () => {
          setOpacity(1);
          syncSliderUI(subMenu, petOpacity);
        },
        keepOpen: true,
      },
    ],
  },
  {
    icon: "⚙️",
    label: "设置",
    items: [
      {
        icon: "🌙",
        label: "专注模式",
        act: () => openLifePanel("focus"),
        state: () => (focusMode ? "开" : "关"),
      },
      { icon: "✨", label: "成长与解锁", act: () => openLifePanel("growth") },
      {
        icon: "🪄",
        label: "作弊模式",
        act: () => openLifePanel("cheat"),
        state: () => (cheatMode ? "开" : "关"),
      },
      {
        icon: "🗣️",
        label: "语音",
        act: () => setVoiceOn(!voiceOn),
        keepOpen: true,
        state: () => (voiceOn ? "开" : "关"),
      },
      {
        slider: true,
        min: 0,
        max: 1,
        step: 0.05,
        get: () => voiceVolume,
        set: setVoiceVolume,
        format: (v) => "语音 " + Math.round(v * 100) + "%",
      },
      { icon: "⏹", label: "停止语音", act: () => voiceDirector?.stop() },
      {
        icon: "📍",
        label: "回到右下角",
        act: () => ipcRenderer.send("reset-pos"),
      },
      // 带 state() 的项会把当前状态缀在标签后面，点完由 buildSubItem 重绘刷新
      {
        icon: "🔔",
        label: "音效",
        act: () => setSound(!soundOn),
        keepOpen: true,
        state: () => (soundOn ? "开" : "关"),
      },
      {
        icon: "🖱️",
        label: "点击穿透",
        act: () => setClickThrough(!clickThrough),
        keepOpen: true,
        state: () => (clickThrough ? "开" : "关"),
      },
      {
        icon: "🌙",
        label: "月光特效",
        act: () => setMotes(!motesOn),
        keepOpen: true,
        state: () => (motesOn ? "开" : "关"),
      },
      {
        icon: "👀",
        label: "鼠标注视",
        act: () => setGazeTracking(!gazeTracking),
        keepOpen: true,
        state: () => (gazeTracking ? "开" : "关"),
      },
      {
        icon: "🪽",
        label: "大招特效强度",
        act: () => setBurstIntensity((burstIntensity + 1) % 3),
        keepOpen: true,
        state: () => BURST_INTENSITY_NAMES[burstIntensity],
      },
      {
        icon: "🍃",
        label: "大招减少运动",
        act: () => setReducedMotion(!reducedMotion),
        keepOpen: true,
        state: () => (reducedMotion ? "开" : "关"),
      },
      // 走动频率三档。默认「正常」= 2026-10-07 调高后那组数值（用户反馈偏低的修正结果）。
      {
        icon: "🐾",
        label: "活跃度",
        act: () => setActivity((activity + 1) % 3),
        keepOpen: true,
        state: () => ACTIVITY_NAMES[activity],
      },
      {
        icon: "↺",
        label: "恢复默认外观",
        act: () => {
          setScale(DEFAULT_SCALE);
          setOpacity(1);
          syncSliderUI(subMenu, petScale);
        },
        keepOpen: true,
      },
      // 好感度：没有独立面板，就在菜单里给个"当前档位 + 进度 + 冷却"的读数。
      // 不加这一项的话用户没法知道互动到底有没有累积。
      { icon: "🍰", label: "喂食", act: () => feed() },
      // 状态读数：把"她现在怎么了"集中在一处显示（需求轴变多后，散着看不过来）。
      // 这也是"状态可读"那点想法的落地：状态只有被看见，用户才会去照顾。
      {
        icon: "💠",
        label: "状态",
        keepOpen: true,
        act: () => {
          const st = currentState();
          const parts = [STATE_TABLE[st].word];
          parts.push("精力 " + Math.round(energy));
          parts.push("饱食 " + Math.round(hunger));
          parts.push("好感「" + tierOf(affection).name + "」");
          if (STATE_TABLE[st].hint) parts.push(STATE_TABLE[st].hint);
          showBubble(parts.join(" · "));
        },
        state: () => STATE_WORDS[currentState()],
      },
      {
        icon: "💗",
        label: "好感度",
        keepOpen: true,
        act: () => {
          const t = tierOf(affection);
          const next = TIERS[TIERS.indexOf(t) + 1];
          const left = Math.ceil(affectionCooldownLeft() / 1000);
          const tail = next
            ? `（距「${next.name}」还差 ${Math.max(0, next.min - affection)} 点）`
            : "（已是最高档）";
          showBubble(
            `现在是「${t.name}」· 好感度 ${affection}${tail}${left > 0 ? ` · ${left} 秒后可再涨` : ""}`,
          );
        },
        state: () => tierOf(affection).name,
      },
    ],
  },
  // 「退出」不放分栏里，作为总栏最底部的一项单独列出
  { icon: "🪽", label: "大招", act: () => playMoonBurst() },
  { sep: true },
  { icon: "❌", label: "退出", act: () => window.close() },
];

let openGroup = -1;
let menuOpen = false;
const actionKeysByLabel = {
  向左走: "walk-left",
  向右走: "walk-right",
  向左跑: "run-left",
  向右跑: "run-right",
  月翼天穹: "burst",
  颔首致意: "bow",
  月光祈愿: "wish",
  静静聆听: "listen",
  生气跺脚: "stomp",
  捂脸笑: "cover-laugh",
  比耶: "peace",
  打招呼: "wave",
  惊讶捂嘴: "surprise",
  蹲下比心: "sit-heart",
  俏皮眨眼: "wink",
  开心托腮: "happy-cheeks",
  托腮发呆: "rest-chin",
  打哈欠: "yawn",
};
MENU.find((g) => g.label === "动作").items.forEach((it) => {
  it.contentKind = "action";
  it.contentId = actionKeysByLabel[it.label];
});
MENU.find((g) => g.label === "姿势").items.forEach((it, i) => {
  it.contentKind = "pose";
  it.contentId = USER_POSES[i].id;
  it.pose = USER_POSES[i];
});

MENU.forEach((g, i) => {
  if (g.sep) {
    // 分隔线（把「退出」和上面几组隔开）
    const hr = document.createElement("div");
    hr.className = "msep";
    g.el = hr;
    rightMenu.appendChild(hr);
    return;
  }
  const el = document.createElement("div");
  el.className = "mi";
  if (g.items) {
    el.innerHTML = g.icon + " " + g.label + '<span class="arw">▸</span>';
    el.onclick = (ev) => {
      ev.stopPropagation();
      openSub(i);
    };
    el.onmouseenter = () => {
      if (openGroup >= 0) openSub(i);
    }; // 已展开时划过即切换
  } else {
    // 顶层单项：不展开分栏，点了直接执行（「退出」就是这种）
    el.textContent = g.icon + " " + g.label;
    el.onclick = (ev) => {
      ev.stopPropagation();
      hideMenus();
      g.act();
    };
  }
  rightMenu.appendChild(el);
  g.el = el;
});

function applyMenuOrder() {
  hideMenus();
  const { orderedMenu } = require("../core/menu-order");
  // Separators belong to the original layout; hide them for a custom layout.
  for (const g of MENU)
    if (g.sep && g.el) g.el.hidden = !!menuOrder.root?.length;
  const sorted = orderedMenu(
    MENU.filter((g) => !g.sep),
    menuOrder.root,
  );
  if (menuOrder.root?.length) {
    for (const g of sorted) rightMenu.appendChild(g.el);
  } else {
    for (const g of MENU) rightMenu.appendChild(g.el);
  }
}
applyMenuOrder();

// 实测一下主栏宽度和最宽分栏，据此定窗口右侧要预留多少 ——
// 主栏居中于宠物后，右侧必须放得下分栏，否则分栏会被窗口裁掉。
(function calibrateMenuReserve() {
  const keepDisplay = rightMenu.style.display;
  rightMenu.style.visibility = "hidden";
  rightMenu.style.display = "block";
  const w1 = rightMenu.offsetWidth;
  rightMenu.style.display = keepDisplay;
  rightMenu.style.visibility = "";
  MENU_RESERVE = Math.ceil(w1 / 2) + measureMaxSubWidth() + 8;
})();

function buildSubItem(it) {
  if (it.slider) {
    const row = document.createElement("div");
    row.className = "mi sl";
    const input = document.createElement("input");
    input.type = "range";
    input.min = it.min;
    input.max = it.max;
    input.step = it.step;
    input.value = it.get();
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = it.format(Number(input.value));
    input.oninput = () => {
      it.set(Number(input.value));
      val.textContent = it.format(Number(input.value));
      syncPresetHighlight(subMenu, Number(input.value)); // 滑块动了就同步预设按钮高亮
    };
    // 滑块上的按下/点击不能冒泡出去（父级 item 的 onclick 会关菜单、body 的 onclick 也会）
    row.onclick = (ev) => ev.stopPropagation();
    row.onmousedown = (ev) => ev.stopPropagation();
    row.onpointerdown = (ev) => ev.stopPropagation();
    row.appendChild(input);
    row.appendChild(val);
    return row;
  }
  if (it.presets) {
    // 一排固定倍率按钮：滑块负责精调，这里常用值一键到位
    const row = document.createElement("div");
    row.className = "mi ps";
    it.presets.forEach((v) => {
      const b = document.createElement("button");
      b.className = "pbtn";
      b.dataset.v = String(v);
      b.textContent = Math.round(v * 100) + "%";
      if (Math.abs(it.get() - v) < 1e-6) b.classList.add("on");
      b.onclick = (ev) => {
        ev.stopPropagation();
        it.set(v);
        syncPresetHighlight(subMenu, v);
        // 顺手把滑块和数值标签拨到同一个值，别出现"标签显示 140% 但实际是 200%"
        const sl = subMenu.querySelector("input[type=range]");
        const val = subMenu.querySelector(".val");
        if (sl) sl.value = String(v);
        if (val) val.textContent = Math.round(v * 100) + "%";
      };
      row.appendChild(b);
    });
    row.onclick = (ev) => ev.stopPropagation();
    row.onmousedown = (ev) => ev.stopPropagation();
    row.onpointerdown = (ev) => ev.stopPropagation();
    return row;
  }
  const el = document.createElement("div");
  el.className = "mi";
  // 带 state() 的项把当前状态缀在标签后面（如「🔔 音效 · 开」）。
  if (it.items) {
    el.innerHTML = it.icon + " " + it.label + '<span class="arw">▸</span>';
    el.onclick = (event) => {
      event.stopPropagation();
      openStoryMenu();
    };
    return el;
  }
  // 点完必须重绘分栏才能刷新标签，否则要关掉菜单再打开才看得到变化。
  el.textContent =
    it.icon + " " + it.label + (it.state ? " · " + it.state() : "");
  if (it.keepOpen) {
    // 留着菜单不关 —— 方便连着点（碎碎念、试几个预设都是这个需求）
    el.onclick = (ev) => {
      ev.stopPropagation();
      it.act();
      if (it.state && openGroup >= 0) renderSubItems(MENU[openGroup]);
    };
  } else {
    el.onclick = (ev) => {
      ev.stopPropagation();
      hideMenus();
      it.act();
    };
  }
  return el;
}

function syncPresetHighlight(scope, value) {
  scope.querySelectorAll(".pbtn").forEach((b) => {
    b.classList.toggle("on", Math.abs(Number(b.dataset.v) - value) < 1e-6);
  });
}

// 把分栏里的滑块/百分比标签/预设高亮刷成「当前值」。
// 点预设、点恢复默认、拖滑块都要调它，否则会出现"标签显示 140% 但实际是 200%"。
function syncSliderUI(scope, value) {
  const sl = scope.querySelector("input[type=range]");
  const val = scope.querySelector(".val");
  if (sl) sl.value = String(value);
  if (val) val.textContent = Math.round(value * 100) + "%";
  syncPresetHighlight(scope, value);
}

function renderSubItems(g) {
  subMenu.innerHTML = "";
  subMenu.classList.toggle("pose-grid", ["姿势", "换装秀"].includes(g.label));
  const items = require("../core/menu-order").orderedMenu(
    visibleMenuItems(g),
    menuOrder["group:" + g.label],
  );
  if (g.label === "换装秀")
    items.sort(
      (a, b) =>
        Number(controlFavorites.includes("换装秀:" + b.label)) -
        Number(controlFavorites.includes("换装秀:" + a.label)),
    );
  for (const it of items) {
    const el = buildSubItem(it);
    if (it.pose || it.preview) {
      el.classList.add("pose-card");
      const label = el.textContent;
      el.textContent = "";
      const image = document.createElement("img");
      image.src = (it.pose || it.preview).frame;
      image.alt = "";
      el.appendChild(image);
      const caption = document.createElement("span");
      caption.textContent = label;
      el.appendChild(caption);
      if (it.preview) {
        const favoriteId = "换装秀:" + it.label;
        const star = document.createElement("button");
        star.type = "button";
        const selected = controlFavorites.includes(favoriteId);
        star.className = "pose-favorite" + (selected ? " selected" : "");
        star.textContent = selected ? "★" : "☆";
        star.setAttribute(
          "aria-label",
          (selected ? "取消收藏" : "收藏") + it.label,
        );
        star.onclick = (ev) => {
          ev.stopPropagation();
          if (controlFavorites.includes(favoriteId))
            controlFavorites = controlFavorites.filter(
              (id) => id !== favoriteId,
            );
          else {
            if (controlFavorites.length >= 40) {
              showBubble("收藏已满，先移除一些吧。");
              return;
            }
            controlFavorites.push(favoriteId);
          }
          saveSettings();
          renderSubItems(g);
        };
        el.append(star);
      }
      if (it.pose) {
        const star = document.createElement("button");
        star.type = "button";
        star.className =
          "pose-favorite" + (favoritePose === it.pose.id ? " selected" : "");
        star.textContent = favoritePose === it.pose.id ? "★" : "☆";
        star.setAttribute("aria-label", "收藏" + it.pose.label);
        star.onclick = (ev) => {
          ev.stopPropagation();
          favoritePose = favoritePose === it.pose.id ? -1 : it.pose.id;
          saveSettingsSoon();
          renderSubItems(g);
        };
        el.appendChild(star);
      }
    }
    subMenu.appendChild(el);
  }
  if (["动作", "姿势", "换装秀"].includes(g.label)) {
    const note = document.createElement("button");
    note.type = "button";
    note.className = "unlock-note";
    note.textContent = `已开放 ${items.length}/${g.items.length} · 查看成长`;
    note.onclick = (ev) => {
      ev.stopPropagation();
      openLifePanel("growth");
    };
    subMenu.appendChild(note);
  }
}

function measureMaxSubWidth() {
  // 把每个分栏都试量一遍取最宽值，这样主栏位置能保证「主栏+分栏」整组塞进窗口
  const keepHtml = subMenu.innerHTML,
    keepDisplay = subMenu.style.display;
  subMenu.style.visibility = "hidden";
  subMenu.style.left = "-9999px";
  subMenu.style.display = "block";
  let max = 0;
  MENU.forEach((g) => {
    if (!g.items) return; // 分隔线、顶层单项没有分栏
    renderSubItems(g);
    max = Math.max(max, subMenu.offsetWidth);
  });
  subMenu.innerHTML = keepHtml;
  subMenu.style.display = keepDisplay;
  subMenu.style.visibility = "";
  subMenu.style.left = "";
  return max;
}

function placeMenus() {
  if (!menuOpen) return;
  const w1 = rightMenu.offsetWidth,
    h1 = rightMenu.offsetHeight;
  // 主栏始终居于桌宠中心。因为缩放以宠物中心为锚点，这个中心在屏幕上是固定的，
  // 且这里用的是不受呼吸动画影响的 offset* 值，所以拖缩放滑块时菜单是纹丝不动的。
  const pc = petCenterInWindow();
  const cx = pc.x - w1 / 2;
  const cy = pc.y - h1 / 2;
  // 取整到整数像素：宠物中心是整数，菜单尺寸是整数，这样每次算出来都是同一个值，
  // 缩放过程中位置精确不变（半像素会让浏览器按小数渲染，看起来就是在抖）。
  const left = Math.round(
    Math.max(0, Math.min(cx, Math.max(0, window.innerWidth - w1))),
  );
  const top = Math.round(
    Math.max(0, Math.min(cy, Math.max(0, window.innerHeight - h1))),
  );
  rightMenu.style.left = left + "px";
  rightMenu.style.top = top + "px";
  if (openGroup >= 0) {
    // 分栏固定贴主栏右侧，**不翻面**（翻到左边会让人以为点错了）。
    // 窗口宽度已按「主栏居中 + 右侧放得下最宽分栏」预留过，正常不会溢出，这里只兜底钳位。
    const w2 = subMenu.offsetWidth,
      h2 = subMenu.offsetHeight;
    let sl = left + w1;
    if (sl + w2 > window.innerWidth) sl = Math.max(0, window.innerWidth - w2);
    const st = Math.max(0, Math.min(top, Math.max(0, window.innerHeight - h2)));
    subMenu.style.left = Math.round(sl) + "px";
    subMenu.style.top = Math.round(st) + "px";
  }
}

function openSub(i) {
  const g = MENU[i];
  if (!g || !g.items) return; // 分隔线 / 顶层单项没有分栏
  MENU.forEach((x) => x.el && x.el.classList.remove("active"));
  g.el.classList.add("active");
  renderSubItems(g);
  subMenu.style.display = "block";
  openGroup = i;
  placeMenus();
}

function hideSubOnly() {
  subMenu.classList.remove("pose-grid");
  subMenu.style.display = "none";
  openGroup = -1;
  MENU.forEach((g) => g.el && g.el.classList.remove("active"));
}

function hideMenus() {
  subMenu.classList.remove("pose-grid");
  menuOpen = false;
  ipcRenderer.send("menu-state", !!lifeUI?.modalActive);
  rightMenu.style.display = "none";
  subMenu.style.display = "none";
  openGroup = -1;
  MENU.forEach((g) => g.el && g.el.classList.remove("active"));
  // 菜单收起后不用管穿透：主进程每 33ms 自算，会自动恢复
}

function showMainMenu() {
  releaseEdgePeek();
  lifeUI?.close();
  refreshGrowthMenus();
  menuOpen = true;
  ipcRenderer.send("menu-state", true); // 菜单开着时主进程会强制不穿透
  hideSubOnly();
  rightMenu.style.display = "block";
  placeMenus();
  sendIgnore(false); // 菜单展开时必须能接收点击，否则点不动菜单
}

// ===== 点击穿透 =====
// 窗口是 396x448 的矩形，而人物只占中间一块，四周全是透明的。
// 不做处理的话整块矩形都会吃掉点击 —— 用户点桌面图标、拖别的窗口
// 都会被这块"看不见的玻璃"挡住（同类项目踩过同一个坑）。
//
// ⚠️ 穿透状态的**唯一权威是主进程**（它每 33ms 用光标位置自己算，见 app/main.js）。
// 渲染层**不再**参与判定 —— 2026-10-07 实测发现：
//   窗口处于穿透状态时，被 forward 转发进来的 mousemove 带的是**物理像素**坐标，
//   而事件里的 clientX 却按 DIP 减了窗口原点（例：screenX=1214(物理) - 窗口 x=900(DIP)
//   = clientX 314，实际应是 71）。按这种坐标做命中判定必然算错，
//   于是渲染层把主进程刚关掉的穿透又打开，两边互相覆盖 —— 表现为"点身体没反应"。
// 这里只保留 lastMouse 供调试快照显示，`set-ignore-mouse` 这条通道保留给
// "菜单必须能点"这种明确意图（主进程也会在菜单打开时强制不穿透）。
function sendIgnore(next) {
  if (lifeUI?.modalActive) next = false;
  if (next === ignoringMouse) return; // 每个 mousemove 都发 IPC 会白烧 CPU
  ignoringMouse = next;
  ipcRenderer.send("set-ignore-mouse", next);
}

// 窗口级的按下计数：只要鼠标在窗口内按下就会计数，与命中哪个元素无关。
document.addEventListener(
  "mousedown",
  () => {
    statDowns++;
  },
  true,
);

const moveLog = [];
window.addEventListener("mousemove", (e) => {
  statMoves++;
  moveLog.push([e.clientX, e.clientY, e.screenX, e.screenY]);
  if (moveLog.length > 6) moveLog.shift();
  lastMouse = { x: e.clientX, y: e.clientY };
});

// 窗口尺寸变化时（拖滑块会连续触发）重算。宠物的中心是固定的，所以算出来还是原位。
window.addEventListener("resize", () => {
  placeMenus();
  placeBubble();
});

// 点到窗口外面（桌面或别的程序）时窗口会失焦，借此收起菜单。
// 只靠 document.body.onclick 是收不到的 —— 窗口外的事件根本不会进到渲染层。
window.addEventListener("blur", hideMenus);

// 点击空白关菜单
document.body.onclick = (e) => {
  if (rightMenu.contains(e.target) || subMenu.contains(e.target)) return;
  hideMenus();
};
