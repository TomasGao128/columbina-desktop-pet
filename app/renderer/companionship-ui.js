function installCompanionshipUI({
  state,
  focus,
  cheat,
  adjust,
  favorite,
  playFavorite,
  previewRelation,
  celebrateRelation,
  modalChanged,
}) {
  const panel = document.createElement("section");
  panel.id = "companionPanel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "陪伴设置");
  const notice = document.createElement("section");
  notice.id = "relationNotice";
  notice.hidden = true;
  notice.setAttribute("role", "dialog");
  notice.setAttribute("aria-live", "polite");
  document.body.append(panel, notice);
  let mode = "memory",
    noticeTimer = null,
    effectTimer = null,
    effect = null,
    currentNotice = null,
    disposed = false;
  const queue = [];
  const text = (tag, value, parent = panel) => {
    const el = document.createElement(tag);
    el.textContent = value;
    parent.appendChild(el);
    return el;
  };
  const button = (label, act, parent = panel) => {
    const b = text("button", label, parent);
    b.type = "button";
    b.onclick = (e) => {
      e.stopPropagation();
      act();
    };
    return b;
  };
  function closeButton(parent, close) {
    const b = button("×", close, parent);
    b.className = "panel-close";
    b.setAttribute("aria-label", "关闭");
  }
  function clearEffect() {
    clearTimeout(effectTimer);
    effectTimer = null;
    effect?.remove();
    effect = null;
  }
  function finishNotice() {
    clearTimeout(noticeTimer);
    noticeTimer = null;
    clearEffect();
    notice.hidden = true;
    currentNotice = null;
    modalChanged();
    nextNotice();
  }
  function nextNotice() {
    if (
      disposed ||
      currentNotice ||
      !panel.hidden ||
      !notice.hidden ||
      !queue.length
    )
      return;
    currentNotice = queue.shift();
    if (celebrateRelation) {
      effect = celebrateRelation(currentNotice);
      modalChanged();
      noticeTimer = setTimeout(() => {
        clearEffect();
        renderNotice();
      }, 5600);
    } else renderNotice();
  }
  function renderNotice() {
    if (disposed || !currentNotice) return;
    const n = currentNotice,
      s = state();
    notice.replaceChildren();
    notice.hidden = false;
    closeButton(notice, finishNotice);
    notice.dataset.maximum = String(n.tier.min >= 140);
    notice.dataset.reduced = String(s.reduced);
    notice.setAttribute("aria-labelledby", "relationNoticeTitle");
    text("p", n.preview ? "仪 式 预 览" : "月 光 羁 绊", notice).className =
      "relation-eyebrow";
    const crest = text("div", "", notice);
    crest.className = "relation-crest";
    crest.setAttribute("aria-hidden", "true");
    text("span", n.tier.min >= 140 ? "✦" : "☾", crest).className =
      "relation-symbol";
    const title = text("h2", `羁绊升至「${n.tier.name}」`, notice);
    title.id = "relationNoticeTitle";
    text("p", n.line, notice).className = "relation-quote";
    const stats = text("div", "", notice);
    stats.className = "relation-stats relation-detail";
    for (const [label, value, total, added] of [
      ["已解锁动作", n.actions, n.totalActions, n.newActions?.length || 0],
      ["已解锁姿势", n.poses, n.totalPoses, n.newPoses?.length || 0],
      [
        "已解锁服装",
        n.cosers || 0,
        n.totalCosers || 28,
        n.newCosers?.length || 0,
      ],
    ]) {
      const card = text("div", "", stats);
      card.className = "relation-stat-card";
      text("span", label, card);
      text("strong", String(value), card);
      text("small", `/ ${total}`, card);
      if (added) text("em", `+${added} 新解锁`, card);
    }
    const actionPreview =
      n.tier.min >= 140
        ? n.newActions?.find((action) => action.id === "burst") ||
          n.newActions?.at(-1)
        : n.newActions?.[0];
    const previews = [
      actionPreview,
      n.newCosers?.[0],
      n.tier.min >= 140 ? n.newPoses?.at(-1) : n.newPoses?.[0],
    ].filter(Boolean);
    if (previews.length) {
      const collection = text("div", "", notice);
      collection.className = "relation-unlocks";
      for (const item of previews) {
        const card = text("div", "", collection);
        card.className = "relation-unlock";
        if (item.frame) {
          const image = document.createElement("img");
          image.src = item.frame;
          image.alt = item.label;
          card.appendChild(image);
        } else text("span", "✦", card).className = "relation-unlock-symbol";
        const label = text("div", "", card);
        text("span", "新解锁", label);
        text("strong", item.label, label);
      }
    }
    const hint =
      n.tier.min >= 140
        ? "所有动作与姿势，已经为你开放。"
        : previews.length
          ? "这份新的月光，已经放进动作与姿势菜单。"
          : "羁绊更近了一步，继续互动即可解锁新的动作与姿势。";
    text("p", hint, notice).className = "relation-unlock-note";
    button("收下这份月光  ✦", finishNotice, notice).className =
      "relation-accept";
    if (!s.reduced) {
      const {
        createRelationCelebration,
      } = require("./relation-celebration.js");
      effect = createRelationCelebration(notice, {
        maximum: n.tier.min >= 140,
      });
      effectTimer = setTimeout(clearEffect, 11000);
    }
    modalChanged();
    noticeTimer = setTimeout(finishNotice, 16000);
  }
  function close() {
    panel.hidden = true;
    modalChanged();
    nextNotice();
  }
  function render() {
    const s = state();
    panel.replaceChildren();
    closeButton(panel, close);
    text(
      "h2",
      {
        focus: "安静陪你工作",
        memory: "我们的陪伴记忆",
        growth: "月光羁绊",
        cheat: "作弊模式",
      }[mode],
    );
    if (mode === "focus") {
      text(
        "p",
        s.focused
          ? "我会安静待在这里，陪着你。"
          : "固定休息姿态、暂停随机走动与碎碎念。你仍可以随时摸摸她。",
      );
      const row = text("div", "");
      row.className = "companion-buttons";
      for (const minutes of [25, 45, 0]) {
        const b = button(
          minutes ? `${minutes}分钟` : "不限时",
          () => {
            focus(true, minutes);
            render();
          },
          row,
        );
        if (s.focused && s.focusMinutes === minutes) b.className = "selected";
      }
      text(
        "p",
        s.focused
          ? s.focusUntil
            ? `剩余 ${Math.max(1, Math.ceil((s.focusUntil - Date.now()) / 60000))} 分钟`
            : "正在不限时陪伴"
          : "选择时长即可开始。",
      ).dataset.focusCountdown = "";
      if (s.focused)
        button("结束专注", () => {
          focus(false);
          render();
        }).className = "primary";
    } else if (mode === "memory") {
      for (const [label, value] of [
        [
          "累计陪伴",
          `${Math.floor(s.seconds / 3600)}小时 ${Math.floor((s.seconds % 3600) / 60)}分钟`,
        ],
        ["累计互动", `${s.interactions}次`],
        ["喜欢的姿势", s.favoritePoseLabel || "还没有选好"],
        ["常玩的项目", s.favoriteGameLabel || "慢慢发现吧"],
      ]) {
        const row = text("div", "");
        row.className = "companion-stat";
        text("span", label, row);
        text("strong", value, row);
      }
      text("p", "姿势菜单里的星星可以收藏；玩过的项目会留下记忆。");
      if (s.favoritePoseLabel)
        button("再看看喜欢的姿势", () => {
          close();
          playFavorite();
        }).className = "primary";
    } else if (mode === "growth") {
      text(
        "p",
        `现在是「${s.tier.name}」· 好感 ${Math.min(140, s.affection)} / 140`,
      );
      const track = text("div", "");
      track.className = "progress-track";
      const bar = text("i", "", track);
      bar.style.width = `${Math.min(100, (s.affection / 140) * 100)}%`;
      text(
        "p",
        `已开放 ${s.actionCount}/${s.totalActions} 个动作 · ${s.poseCount}/${s.totalPoses} 个姿势 · ${s.coserCount}/${s.totalCosers} 套服装`,
      );
      text("p", `累计互动 ${s.interactions} 次`);
      text(
        "p",
        "换装秀：初见6套；熟悉且互动10次12套；亲密且互动30次20套；挚友全部28套。可在缩略图右上角收藏，收藏优先显示。",
      );
      text(
        "p",
        "初见：各6个；熟悉（20点）且互动10次：各10个；亲密（60点）且互动30次：各14个；挚友（140点）：全部开放。",
      );
      text("p", "设置调整不算互动。短时间连点不会重复计数。");
      if (previewRelation) {
        button("预览升级仪式", () => {
          close();
          previewRelation();
        }).className = "primary";
      }
    } else {
      text("p", "开启后可以自由调节数值；关闭后保留当前数值，恢复正常成长。");
      button(s.cheat ? "关闭作弊模式" : "开启作弊模式", () => {
        cheat(!s.cheat);
        render();
      }).className = "primary";
      if (s.cheat)
        for (const [key, label, max] of [
          ["affection", "好感度", 140],
          ["energy", "精力", 100],
          ["hunger", "饱食度", 100],
          ["interactionCount", "互动次数", 100],
        ]) {
          const row = text("label", "");
          row.className = "companion-control";
          const line = text("span", "", row);
          text("span", label, line);
          const value = text("strong", String(s[key]), line);
          const input = document.createElement("input");
          input.type = "range";
          input.min = 0;
          input.max = max;
          input.step = 1;
          input.value = Math.min(max, s[key]);
          input.setAttribute("aria-label", label);
          input.oninput = () => {
            adjust(key, Number(input.value));
            value.textContent = input.value;
          };
          row.appendChild(input);
        }
    }
  }
  function open(next) {
    panel.hidden = false;
    if (currentNotice && notice.hidden) finishNotice();
    mode = next;
    panel.hidden = false;
    render();
    modalChanged();
  }
  const block = (e) => e.stopPropagation();
  panel.addEventListener("pointerdown", block);
  panel.addEventListener("click", block);
  panel.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  notice.addEventListener("pointerdown", block);
  notice.addEventListener("click", block);
  const escape = (e) => {
    if (e.key === "Escape") {
      if (!panel.hidden) close();
      else if (currentNotice) finishNotice();
    }
  };
  window.addEventListener("keydown", escape);
  const ticker = setInterval(() => {
    if (!panel.hidden && mode === "focus") {
      const p = panel.querySelector("[data-focus-countdown]"),
        s = state();
      if (p)
        p.textContent = s.focused
          ? s.focusUntil
            ? `剩余 ${Math.max(0, Math.ceil((s.focusUntil - Date.now()) / 60000))} 分钟`
            : "正在不限时陪伴"
          : "本次专注已结束";
    }
  }, 1000);
  return {
    open,
    close,
    get active() {
      return !!currentNotice || !panel.hidden || !notice.hidden;
    },
    get modalActive() {
      return !panel.hidden || !notice.hidden;
    },
    get mode() {
      return mode;
    },
    levelUp(data) {
      queue.push(data);
      nextNotice();
    },
    refresh() {
      if (!panel.hidden) render();
    },
    dispose() {
      disposed = true;
      clearInterval(ticker);
      clearTimeout(noticeTimer);
      clearEffect();
      window.removeEventListener("keydown", escape);
      panel.hidden = notice.hidden = true;
      modalChanged();
      panel.remove();
      notice.remove();
      queue.length = 0;
    },
  };
}
module.exports = { installCompanionshipUI };
