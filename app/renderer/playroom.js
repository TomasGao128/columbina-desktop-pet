// Interactive activities own one director lease and one elapsed-time render loop.
function installPlayroom({
  image,
  container,
  director,
  prepare,
  assets,
  begin,
  ended,
  speak,
  reward,
  ipc,
  reduced,
  layout = () => {},
  sound = () => false,
  mood = () => ({ label: "平静" }),
  emotion = () => {},
  records = () => ({ practice: 0, streak: 0, timed: 0, combo: 0, rhythm: 0 }),
  record = () => false,
  slowMotion = () => true,
  setSlowMotion = () => {},
}) {
  const {
    makeQuestion,
    gradeAnswer,
    beatPosition,
    timingHit,
    shotPoint,
    dribblePoint,
  } = require("../core/playroom-policy");
  const { createBasketballGame } = require("./basketball-game");
  const { drawBasketballCourt } = require("./basketball-view");
  const { createSceneGame } = require("./scene-game");
  const { drawScene } = require("./scene-view");
  let scene = null,
    sceneHit = null;
  let resourceImages = {},
    sceneSequence = null;
  const audio = require("./playroom-audio").createPlayroomAudio(sound);
  let basket = null,
    material = null,
    lastSound = "",
    lastBasketPhase = "";
  const canvas = document.createElement("canvas");
  canvas.className = "playroom-effects";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const bodyCanvas = document.createElement("canvas");
  bodyCanvas.id = "sceneBodyCanvas";
  bodyCanvas.hidden = true;
  bodyCanvas.setAttribute("aria-hidden", "true");
  container.appendChild(bodyCanvas);
  const kittenButton = document.createElement("button");
  kittenButton.type = "button";
  kittenButton.id = "sceneKitten";
  kittenButton.hidden = true;
  kittenButton.setAttribute("aria-label", "摸摸小黑");
  const kittenImage = document.createElement("img");
  kittenImage.alt = "罗小黑";
  kittenImage.id = "sceneKittenImage";
  kittenButton.appendChild(kittenImage);
  document.body.appendChild(kittenButton);
  kittenButton.onclick = (e) => {
    e.stopPropagation();
    interactScene("pet");
  };
  for (const type of ["pointerdown", "contextmenu"])
    kittenButton.addEventListener(type, (e) => e.stopPropagation());
  const panel = document.createElement("section");
  panel.id = "playroomControls";
  panel.hidden = true;
  panel.setAttribute("aria-label", "桌宠小游戏");
  document.body.appendChild(panel);
  let task = null,
    lease = null,
    loading = null,
    version = 0,
    raf = null,
    lastPaint = 0,
    lastBox = "",
    disposed = false;
  let layoutActive = false;
  let heldPointer = null,
    lastPanelHeight = 0;
  const element = (tag, text, parent = panel) => {
    const el = document.createElement(tag);
    el.textContent = text;
    parent.appendChild(el);
    return el;
  };
  function button(text, action, parent = panel) {
    const el = element("button", text, parent);
    el.type = "button";
    el.onclick = (e) => {
      e.stopPropagation();
      action();
    };
    return el;
  }
  function syncBox() {
    if (
      layoutActive &&
      !panel.hidden &&
      panel.offsetHeight !== lastPanelHeight
    ) {
      lastPanelHeight = panel.offsetHeight;
      layout();
    }
    const r = panel.getBoundingClientRect();
    const box = panel.hidden
      ? null
      : { x: r.x, y: r.y, width: r.width, height: r.height };
    const key = JSON.stringify(box);
    if (key !== lastBox) {
      lastBox = key;
      ipc.send("pet-activity-ui", box);
    }
  }
  function clear() {
    heldPointer = null;
    ipc.sendSync("pet-activity-capture", false);
    version++;
    loading?.abort();
    loading = null;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    task = null;
    basket = null;
    scene = null;
    resourceImages = {};
    sceneSequence?.clear();
    sceneSequence = null;
    bodyCanvas.hidden = true;
    image.style.visibility = "";
    sceneHit?.dispose();
    sceneHit = null;
    kittenButton.hidden = true;
    kittenImage.classList.remove("kitten-react");
    container.classList.remove("scene-active");
    material = null;
    audio.clear();
    image.style.translate = "";
    image.style.rotate = "";
    delete image.dataset.activityPose;
    lease = null;
    panel.hidden = true;
    panel.replaceChildren();
    image.classList.remove("playroom-pose");
    canvas.style.display = "none";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    syncBox();
    if (layoutActive) {
      layoutActive = false;
      layout();
    }
  }
  function stop() {
    const owner = lease;
    clear();
    owner?.finish();
    ended();
  }
  function controls() {
    if (!task) return;
    panel.replaceChildren();
    panel.hidden = false;
    const heading = element("div", "");
    heading.className = "playroom-heading";
    element("strong", assets[task.kind].label, heading);
    element("small", mood().label, heading).className = "playroom-mood";
    button("×", stop, heading).setAttribute("aria-label", "结束小游戏");
    const subtitle = element("p", "");
    subtitle.className = "playroom-message";
    subtitle.setAttribute("aria-live", "polite");
    const row = element("div", "");
    row.className = "playroom-buttons";
    if (task.kind === "study") {
      subtitle.textContent = `${task.question.expression} = ?`;
      if (task.phase === "feedback") {
        subtitle.textContent = task.correct
          ? `答对了！${task.question.expression} = ${task.question.answer}`
          : `一起算算：${task.question.expression} = ${task.question.answer}`;
        button(
          "下一题",
          () => {
            task.question = makeQuestion(++task.seed);
            task.phase = "ready";
            task.questionAt = performance.now() - task.started;
            image.src = assets.study.frames[0];
            controls();
          },
          row,
        );
      } else
        task.question.choices.forEach((value, index) =>
          button(String(value), () => answer(index), row),
        );
    } else if (task.kind === "gaming") {
      subtitle.textContent =
        task.phase === "result"
          ? `${task.score >= 3 ? "胜利 ✦" : "差一点…"} · 命中 ${task.score} 次`
          : "光点进入金色区时，点击或按空格";
      if (task.phase === "result")
        button("再玩一局", () => start("gaming"), row);
      else {
        const meter = element("div", "", row);
        meter.className = "playroom-meter";
        element("i", "", meter).className = "playroom-zone";
        element("i", "", meter).className = "playroom-marker";
        const lanes = element("div", "");
        lanes.className = "playroom-tabs playroom-lanes";
        ["A", "S", "D", "F"].forEach((label, i) => {
          const b = button(label, () => tap(i), lanes);
          b.dataset.lane = String(i);
        });
      }
    } else if (scene) {
      const snap = scene.snapshot;
      subtitle.textContent =
        task.kind === "cat"
          ? `${snap.caption} · 小黑开心 ${snap.joy}/5`
          : `${snap.caption} · 轻轻摆腿，慢慢陪伴`;
      row.classList.add("scene-controls");
      if (task.kind === "scenery") {
        const themes = element("div", "");
        themes.className = "playroom-tabs scene-themes";
        for (const [id, label] of [
          ["lake", "湖畔夕阳"],
          ["stars", "星空夜景"],
          ["garden", "樱花庭院"],
        ]) {
          const b = button(label, () => scene.selectTheme(id), themes);
          b.dataset.active = String(snap.theme === id);
        }
      }
      const choices =
        task.kind === "cat"
          ? [
              ["hug", snap.holding ? "重新抱稳" : "抱抱小黑"],
              ["cuddle", "贴脸蹭蹭"],
              ["lap", "膝上陪伴"],
              ["release", "轻轻放下"],
              ["pet", "摸摸小黑"],
              ["lure", "逗猫羽毛"],
              ["chase", "追逐影子"],
              ["roll", "翻翻肚皮"],
              ["stretch", "伸个懒腰"],
              ["nap", "蜷着休息"],
              ["watch", "听它呼噜"],
            ]
          : [
              ["company", "陪她坐会儿"],
              ["feet", "轻摆双腿"],
              ["breeze", "感受微风"],
              ["headpat", "摸摸头"],
              ["comfort", "安慰她"],
            ];
      choices.forEach(([id, text]) =>
        (() => {
          const b = button(text, () => interactScene(id), row);
          if (id === "release") b.disabled = !snap.holding;
          return b;
        })(),
      );
      layout();
      syncBox();
      return;
    } else {
      const snap = basket.snapshot;
      const modes = element("div", "");
      modes.className = "playroom-tabs";
      for (const [id, label] of [
        ["practice", "自由练习"],
        ["streak", "五连进"],
        ["timed", "45秒挑战"],
      ]) {
        const b = button(label, () => basket.setMode(id), modes);
        b.dataset.active = String(snap.mode === id);
      }
      const choices = element("div", "");
      choices.className = "playroom-tabs";
      for (const [id, label] of [
        ["near", "近投"],
        ["mid", "中投"],
        ["far", "远投"],
      ]) {
        const b = button(label, () => basket.setDistance(id), choices);
        b.disabled = snap.phase === "shot";
        b.dataset.active = String(snap.distance === id);
      }
      for (const [id, label] of [
        ["jump", "跳投"],
        ["layup", "上篮"],
      ]) {
        const b = button(label, () => basket.setStyle(id), choices);
        b.disabled = snap.phase === "shot";
        b.dataset.active = String(snap.style === id);
      }
      const preference = element("div", "");
      preference.className = "playroom-tabs";
      const slow = button(
        "进球慢放 " + (slowMotion() ? "开" : "关"),
        () => {
          setSlowMotion(!slowMotion());
          controls();
        },
        preference,
      );
      slow.disabled = snap.phase === "shot" || snap.phase === "charging";
      const stats = element("div", "");
      stats.className = "playroom-stats";
      subtitle.textContent =
        snap.phase === "result"
          ? snap.finished
            ? "本轮结束，来挑战新纪录吧。"
            : snap.made
              ? "空心入网！再来一球？"
              : "偏了一点…调整蓄力再试试。"
          : snap.phase === "shot"
            ? "抬臂、出手…看球划过月光。"
            : "按住投篮或空格蓄力，松开出手 · A / D 换手";
      if (snap.phase === "result") {
        button(snap.finished ? "再来一轮" : "下一球", () => basket.next(), row);
        if (snap.made !== null)
          button("回看这一球", () => basket.replay(), row);
      } else if (snap.phase !== "shot") {
        const meter = element("div", "", row);
        meter.className = "playroom-meter";
        const zone = element("i", "", meter);
        zone.className = "playroom-zone";
        zone.style.left = `${(snap.ideal - 0.04) * 100}%`;
        zone.style.width = "8%";
        element("i", "", meter).className = "playroom-marker";
        const charge = button("按住投篮", () => {}, row);
        charge.className = "playroom-charge";
        charge.onpointerdown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          heldPointer = e.pointerId;
          charge.setPointerCapture(e.pointerId);
          beginCharge(true);
        };
        charge.onpointerup = (e) => {
          e.preventDefault();
          e.stopPropagation();
          heldPointer = null;
          if (charge.hasPointerCapture(e.pointerId))
            charge.releasePointerCapture(e.pointerId);
          shoot();
        };
        charge.onpointercancel = cancelCharge;
        charge.onkeydown = (e) => {
          if (["Space", "Enter"].includes(e.code)) {
            e.preventDefault();
            if (!e.repeat) beginCharge();
          }
        };
        charge.onkeyup = (e) => {
          if (["Space", "Enter"].includes(e.code)) {
            e.preventDefault();
            shoot();
          }
        };
        button("换手", () => basket.crossover(), row);
      }
      layout();
      syncBox();
      return;
    }
    layout();
    syncBox();
  }
  function answer(index) {
    if (
      !task ||
      task.kind !== "study" ||
      task.phase !== "ready" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 2
    )
      return false;
    task.correct = gradeAnswer(task.question, index);
    task.phase = "feedback";
    task.feedbackAt = performance.now();
    image.src = task.correct ? assets.study.frames[2] : assets.study.frames[1];
    speak(
      task.correct
        ? "解出来了…和你一起做题，很开心。"
        : "这次没关系…我们再慢慢想一想。",
    );
    if (task.correct) reward("study");
    controls();
    return true;
  }
  function tap(lane) {
    if (!task || task.kind !== "gaming" || task.phase !== "ready") return false;
    const now = performance.now();
    if (now - task.lastTap < 220) return false;
    const beat = Math.floor((now - task.started) / 1800),
      expected = [0, 2, 1, 3][beat % 4];
    if (task.claimedBeat === beat) return false;
    task.lastTap = now;
    task.lastHit =
      timingHit(beatPosition(now - task.started)) &&
      (lane === undefined || lane === expected);
    if (task.lastHit) task.claimedBeat = beat;
    else {
      task.combo = 0;
      image.src = assets.gaming.frames[2];
    }
    if (task.lastHit) {
      task.score++;
      task.combo++;
      task.bestCombo = Math.max(task.bestCombo, task.combo);
      image.src = assets.gaming.frames[1];
      task.flashAt = now;
      speak(`命中！已经接住 ${task.score} 颗星星。`);
    } else speak("早了一点…跟着光点，再试试。");
    return task.lastHit;
  }
  function shoot(power) {
    heldPointer = null;
    const launched = basket?.release(power) ?? false;
    ipc.sendSync("pet-activity-capture", false);
    return launched;
  }
  function beginCharge(pointer = false) {
    const started = basket?.press() ?? false;
    if (started && pointer) ipc.sendSync("pet-activity-capture", true);
    return started;
  }
  function cancelCharge() {
    heldPointer = null;
    ipc.sendSync("pet-activity-capture", false);
    return basket?.cancelCharge() ?? false;
  }
  function finishGame() {
    task.phase = "result";
    task.feedbackAt = performance.now();
    const won = task.kind === "gaming" ? task.score >= 3 : task.made;
    image.src =
      task.kind === "basketball" && won
        ? assets.basketball.frames[3]
        : won
          ? assets.gaming.frames[1]
          : assets.gaming.frames[2];
    speak(
      won ? "赢了…这一份快乐，也分给你。" : "差一点点…有你陪着，下次再试。",
    );
    record("gaming", { score: task.score });
    emotion(won ? "win" : "miss", { combo: task.bestCombo });
    if (won) reward(task.kind);
    controls();
  }
  function draw(now) {
    if (!task || !lease?.active) return;
    const w = image.offsetWidth,
      h = image.offsetHeight,
      dpr = Math.min(2, devicePixelRatio || 1);
    const stageW = ["basketball", "cat", "scenery"].includes(task.kind)
      ? w * 1.65
      : w;
    const bw = Math.round((stageW + 88) * dpr),
      bh = Math.round((h + 90) * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.width = `${stageW + 88}px`;
      canvas.style.height = `${h + 90}px`;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.setTransform(dpr, 0, 0, dpr, 44 * dpr, 60 * dpr);
    const elapsed = now - task.started;
    const marker = panel.querySelector(".playroom-marker");
    if (marker)
      marker.style.left = `${(basket ? basket.snapshot.power : beatPosition(elapsed)) * 100}%`;
    if (scene) {
      const visual = scene.state(now, reduced());
      if (!scene || !task) return;
      task.phase = visual.phase;
      const frame =
        task.kind === "scenery"
          ? assets.scenery.clips[visual.pose][visual.frame.index]
          : assets.cat.poses[visual.pose];
      if (!image.src.endsWith(frame.slice(2))) image.src = frame;
      image.dataset.activityPose = task.kind + ":" + visual.pose;
      image.dataset.activityFrame = frame;
      image.style.rotate = "";
      drawScene(
        ctx,
        visual,
        w,
        h,
        reduced(),
        resourceImages,
        assets[task.kind],
      );
      if (task.kind === "scenery" && sceneSequence) {
        bodyCanvas.hidden = false;
        image.style.visibility = "hidden";
        image.classList.remove("playroom-pose");
        sceneSequence.draw(visual, w, h, dpr, image.style.opacity || 1);
      }
      if (task.kind === "cat") {
        const wasVisible = !kittenButton.hidden;
        kittenButton.hidden = visual.embedded;
        if (visual.embedded && wasVisible) ipc.send("pet-scene-mask", null);
        if (!visual.embedded) {
          const r = image.getBoundingClientRect(),
            p = visual.kittenPlacement;
          kittenButton.style.left = `${r.left + w * p.x}px`;
          kittenButton.style.top = `${r.top + h * p.y}px`;
          kittenButton.style.width = `${w * p.size}px`;
          kittenButton.style.height = `${w * p.size}px`;
          const sprite = assets.cat.props[visual.kitten];
          if (!kittenImage.src.endsWith(sprite.slice(2)))
            kittenImage.src = sprite;
          kittenImage.style.rotate =
            !reduced() && visual.action === "roll"
              ? `${Math.sin(now / 400) * 6}deg`
              : "";
          kittenImage.classList.toggle(
            "kitten-react",
            visual.phase === "reacting" &&
              !reduced() &&
              !visual.action.startsWith("chase"),
          );
        }
      }
      const message = panel.querySelector(".playroom-message");
      if (message)
        message.textContent =
          task.kind === "cat"
            ? `${visual.caption} · 小黑开心 ${visual.joy}/5`
            : `${visual.caption} · 轻轻摆腿，慢慢陪伴`;
    } else if (task.kind === "basketball") {
      const visual = basket.state(now);
      if (!basket || !task || !lease?.active) return;
      const snap = basket.snapshot;
      task.phase = snap.phase;
      task.made = snap.made;
      const pose = assets.basketball.poses[visual.pose];
      if (!image.src.endsWith(pose.frame.slice(2))) image.src = pose.frame;
      image.dataset.activityPose = visual.pose;
      image.style.translate = `${visual.offset.x * w}px ${visual.offset.y * h}px`;
      drawBasketballCourt(ctx, visual, material, w, h, elapsed, reduced());
      const stats = panel.querySelector(".playroom-stats");
      if (stats)
        stats.textContent = `${snap.score} 分 · ${snap.makes}/${snap.shots} 进球 · 连进 ${snap.combo}${snap.mode === "streak" ? ` · 机会 ${snap.lives}` : snap.mode === "timed" ? ` · 剩余 ${Math.ceil(snap.secondsLeft)}s` : ""} · 最高 ${records()[snap.mode] || 0}${snap.inSlowMotion ? " · 慢放" : snap.replaying ? " · 回看" : ""}`;
      const marker = panel.querySelector(".playroom-marker");
      if (marker) marker.style.left = `${snap.power * 100}%`;
      const soundKey =
        snap.phase === "ready"
          ? `bounce:${Math.floor((now - snap.started - 1000) / 900)}`
          : visual.ball?.phase === "rebound"
            ? `rim:${snap.shots}`
            : visual.ball?.phase === "net"
              ? `swish:${snap.shots}`
              : "";
      if (soundKey !== lastSound) {
        lastSound = soundKey;
        if (soundKey.startsWith("bounce:") && now - snap.started > 1000)
          audio.play("bounce");
        else if (soundKey.startsWith("rim:")) audio.play("rim");
        else if (soundKey.startsWith("swish:")) audio.play("swish");
      }
    } else {
      ctx.fillStyle = "#d8bdff";
      ctx.font = `${Math.max(12, w * 0.045)}px Georgia`;
      const phase = reduced() ? 0 : Math.sin(elapsed / 700) * 0.025;
      ctx.fillText(
        task.kind === "study" ? "✦  x + y  ✦" : "✦  LEVEL UP  ✦",
        w * 0.55,
        h * (0.18 + phase),
      );
      if (
        task.kind === "study" &&
        task.phase === "ready" &&
        elapsed - task.questionAt > 8000
      )
        image.src = assets.study.frames[1];
      if (task.kind === "gaming" && task.phase === "ready") {
        const beat = Math.floor(elapsed / 1800),
          lane = [0, 2, 1, 3][beat % 4];
        for (const b of panel.querySelectorAll("[data-lane]"))
          b.dataset.active = String(Number(b.dataset.lane) === lane);
        if (beat !== task.lastBeat) {
          if (task.lastBeat >= 0 && task.claimedBeat !== task.lastBeat)
            task.combo = 0;
          task.lastBeat = beat;
          image.src = assets.gaming.frames[0];
        }
      }
      if (task.kind === "gaming" && task.phase === "ready" && elapsed >= 10000)
        finishGame();
    }
    if (!task) return;
    if (task.phase === "feedback" || task.phase === "result") {
      const age = now - task.feedbackAt;
      if (age < 1800)
        for (let i = 0; i < 12; i++) {
          const angle = (i * Math.PI) / 6;
          ctx.fillStyle =
            task.correct || task.made || task.score >= 3
              ? "#ffe5a4"
              : "#c9b5ed";
          ctx.font = "16px Georgia";
          ctx.fillText(
            "✦",
            w * (0.5 + Math.cos(angle) * 0.32),
            h * (0.4 + Math.sin(angle) * 0.26),
          );
        }
    }
    syncBox();
  }
  function tick(now) {
    if (disposed || !task || !lease?.active) {
      raf = null;
      return;
    }
    if (now - lastPaint >= (task?.kind === "scenery" ? 16 : 33)) {
      lastPaint = now;
      draw(now);
    }
    raf =
      !disposed && task && lease?.active ? requestAnimationFrame(tick) : null;
  }
  async function start(kind) {
    if (disposed || !assets[kind] || !begin()) return false;
    const cfg = assets[kind];
    lease = director.acquire("activity:" + kind, {
      priority: 70,
      cleanup: () => {
        clear();
        ended();
      },
    });
    if (!lease) {
      ended();
      return false;
    }
    const current = ++version;
    loading = new AbortController();
    task = {
      kind,
      phase: "loading",
      started: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      lastBeat: -1,
      claimedBeat: -1,
      questionAt: 0,
      lastTap: -Infinity,
      seed: Date.now() >>> 0,
    };
    speak("准备好了…我们一起玩吧。");
    try {
      const controller = loading;
      let timeout, decoded;
      const files = [...cfg.frames, ...Object.values(cfg.props || {})];
      try {
        decoded = await Promise.race([
          prepare(files, {
            signal: controller.signal,
          }),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Activity loading timed out")),
              5000,
            );
          }),
        ]);
        if (kind === "basketball") material = decoded[decoded.length - 1];
      } finally {
        clearTimeout(timeout);
      }
      if (current !== version || !lease?.active) return false;
      loading = null;
      if (["cat", "scenery"].includes(kind))
        resourceImages = Object.fromEntries(
          files.map((f, i) => [f, decoded[i]]),
        );
      task.phase = "ready";
      task.started = performance.now();
      task.question = makeQuestion(task.seed);
      if (["cat", "scenery"].includes(kind)) {
        scene = createSceneGame({
          kind,
          onMessage: speak,
          onCare: (value) => emotion(value),
          onReward: () => reward("cat"),
          onChange: () => {
            if (scene && task) {
              task.phase = scene.snapshot.phase;
              controls();
            }
          },
        });
        task.phase = "idle";
        speak(
          kind === "cat"
            ? "小黑过来了…一起陪它玩一会儿吧。"
            : require("./scene-game").THEMES.stars.text,
        );
        if (kind === "scenery")
          sceneSequence = require("./scene-sequence-view").createSceneSequence({
            canvas: bodyCanvas,
            config: cfg,
            images: resourceImages,
          });
        container.classList.add("scene-active");
        canvas.style.zIndex = "0";
        if (kind === "cat") {
          kittenImage.src = cfg.props.idle;
          sceneHit = require("./body-hit-runtime").installBodyHit({
            image: kittenImage,
            container: kittenButton,
            ipc,
            protectedState: () => false,
            channel: "pet-scene-mask",
          });
        }
      } else canvas.style.zIndex = "3";
      emotion("care");
      if (kind === "basketball")
        basket = createBasketballGame({
          poses: cfg.poses,
          onMessage: speak,
          onReward: () => reward("basketball"),
          slowMotion,
          reduced,
          onResult: (result) => {
            record("basketball", result);
            emotion(result.made ? "win" : "miss", result);
          },
          onChange: () => {
            if (!basket || !task) return;
            task.phase = basket.snapshot.phase;
            if (task.phase !== "charging")
              ipc.sendSync("pet-activity-capture", false);
            // Retain the captured charge button throughout a held pointer/key.
            if (
              task.phase === "charging" ||
              (lastBasketPhase === "charging" && task.phase === "ready")
            ) {
              lastBasketPhase = task.phase;
              return;
            }
            lastBasketPhase = task.phase;
            controls();
          },
        });
      image.src = cfg.frames[0];
      image.classList.add("playroom-pose");
      canvas.style.display = "block";
      layoutActive = true;
      layout();
      controls();
      lastPaint = 0;
      raf = requestAnimationFrame(tick);
      return true;
    } catch (error) {
      if (current === version) {
        stop();
        speak("这次没有准备好…稍后再试。");
      }
      return false;
    }
  }
  function key(event) {
    if (!task) return;
    if (event.key === "Escape") {
      event.preventDefault();
      stop();
    } else if (
      event.code === "Space" &&
      !event.repeat &&
      event.target.tagName !== "BUTTON"
    ) {
      event.preventDefault();
      if (task.kind === "gaming") tap();
      else if (task.kind === "basketball") beginCharge();
    } else if (
      task.kind === "basketball" &&
      ["KeyA", "KeyD"].includes(event.code) &&
      !event.repeat
    ) {
      event.preventDefault();
      basket?.crossover();
    } else if (
      task.kind === "gaming" &&
      ["KeyA", "KeyS", "KeyD", "KeyF"].includes(event.code) &&
      !event.repeat
    ) {
      event.preventDefault();
      tap(["KeyA", "KeyS", "KeyD", "KeyF"].indexOf(event.code));
    }
  }
  const keyUp = (e) => {
    if (
      task?.kind === "basketball" &&
      e.code === "Space" &&
      e.target.tagName !== "BUTTON"
    ) {
      e.preventDefault();
      shoot();
    }
  };
  const pointerUp = (e) => {
    if (e.pointerId === heldPointer) {
      heldPointer = null;
      shoot();
    }
  };
  const pointerCancel = (e) => {
    if (e.pointerId === heldPointer) cancelCharge();
  };
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerCancel);
  const sceneBody = (e) => {
    if (!scene || !task || e.button > 0) return;
    const r = image.getBoundingClientRect(),
      y = (e.clientY - r.top) / r.height;
    interactScene(
      e.target.id === "headZone" || y < 0.4
        ? "headpat"
        : task.kind === "scenery" && y > 0.65
          ? "feet"
          : task.kind === "cat"
            ? "pet"
            : "company",
    );
  };
  container.addEventListener("click", sceneBody);
  const blur = cancelCharge;
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", blur);
  for (const type of ["pointerdown", "click", "contextmenu"])
    panel.addEventListener(type, (e) => e.stopPropagation());
  window.addEventListener("keydown", key);
  window.addEventListener("resize", syncBox);
  function interactScene(action) {
    return scene?.interact(action) ?? false;
  }
  return {
    interactScene,
    selectSceneTheme: (id) => scene?.selectTheme(id) ?? false,
    get bodySource() {
      return task?.kind === "scenery" && sceneSequence && !bodyCanvas.hidden
        ? sceneSequence.source
        : null;
    },
    replay: () => basket?.replay() ?? false,
    start,
    stop,
    cancel: clear,
    answer,
    tap,
    shoot,
    beginCharge,
    crossover: () => basket?.crossover() ?? false,
    setBasketMode: (mode) => basket?.setMode(mode) ?? false,
    setDistance: (value) => basket?.setDistance(value) ?? false,
    setShotStyle: (value) => basket?.setStyle(value) ?? false,
    get status() {
      return task
        ? {
            ...(basket?.snapshot || {}),
            scene: scene?.snapshot ?? null,
            mood: mood(),
            records: { ...records() },
            slowMotion: slowMotion(),
            panelHeight: panel.hidden ? 0 : panel.offsetHeight,
            kind: task.kind,
            phase: task.phase,
            started: task.started,
            score: basket ? basket.snapshot.score : task.score,
            combo: basket ? basket.snapshot.combo : task.combo,
            bestCombo: basket ? basket.snapshot.bestCombo : task.bestCombo,
            question: task.question,
            made: task.made,
            correct: task.correct,
          }
        : null;
    },
    dispose() {
      clear();
      audio.dispose();
      disposed = true;
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", syncBox);
      container.removeEventListener("click", sceneBody);
      kittenButton.remove();
      panel.remove();
      canvas.remove();
      bodyCanvas.remove();
    },
  };
}
module.exports = { installPlayroom };
