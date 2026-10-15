(() => {
  const api = window.petChat,
    $ = (id) => document.getElementById(id);
  const labels = {
    chat: "陪伴聊天",
    polish: "文字润色",
    paper: "论文修改",
    summary: "提炼摘要",
  };
  let mode = "chat",
    history = [],
    active = null,
    settings = null,
    memories = [],
    editMemoryId = null,
    loadVersion = 0,
    loading = false;
  const drafts = { chat: "", polish: "", paper: "", summary: "" };
  const status = (text) => {
    $("status").textContent = text;
  };
  function setBusy(value) {
    $("send").disabled = value;
    $("stop").hidden = !value;
    for (const id of ["saveConfig", "testConnection", "forgetKey"])
      $(id).disabled = value;
    for (const button of $("memoryPanel").querySelectorAll("button"))
      if (button.id !== "closeMemory") button.disabled = value;
  }
  function addMessage(record) {
    const node = document.createElement("article");
    node.className = "message " + record.role;
    const who = document.createElement("div");
    who.className = "who";
    who.textContent =
      record.role === "user"
        ? "你"
        : record.mode === "chat"
          ? "哥伦比娅"
          : "文字助手";
    const body = document.createElement("div");
    body.className = "content";
    body.textContent = record.content;
    const footer = document.createElement("footer"),
      copy = document.createElement("button");
    copy.textContent = "复制";
    copy.onclick = () => {
      api.copy(body.textContent);
      status("已复制到剪贴板。");
    };
    footer.append(copy);
    if (record.role === "user" && record.mode === "chat") {
      const remember = document.createElement("button");
      remember.textContent = "记住这句";
      remember.onclick = () => {
        $("memoryPanel").hidden = false;
        $("settingsPanel").hidden = true;
        editMemoryId = null;
        $("memoryKind").value = "topic";
        $("memoryText").value = record.content.slice(0, 240);
        $("saveMemory").textContent = "记住";
        $("cancelMemoryEdit").hidden = true;
        $("memoryStatus").textContent = "确认或调整内容后点击「记住」。";
      };
      footer.append(remember);
    }
    if (record.partial) {
      const note = document.createElement("span");
      note.className = "partial";
      note.textContent = "未完成";
      footer.prepend(note);
    }
    node.append(who, body, footer);
    $("messages").append(node);
    return { node, body, record, footer };
  }
  function render() {
    $("messages").replaceChildren();
    const entries = history.filter((m) => m.mode === mode);
    if (!entries.length) {
      const el = document.createElement("div");
      el.className = "empty";
      const title = document.createElement("strong");
      title.textContent = mode === "chat" ? "想聊些什么呢？" : "把文字交给我吧";
      const text = document.createElement("p");
      text.textContent =
        mode === "chat"
          ? "今天的心情、一个小发现，或只是想找人说说话。"
          : mode === "paper"
            ? "粘贴需要修改的论文段落，也可以说明希望改善的地方。"
            : "粘贴文本，再告诉我你希望怎样处理。";
      el.append(title, text);
      $("messages").append(el);
    } else entries.forEach(addMessage);
    $("suggestions").hidden = mode !== "chat";
    $("modeTitle").textContent = labels[mode];
    $("memoryToggle").hidden = mode !== "chat";
    $("clearHistory").textContent = "清空" + labels[mode] + "记录";
    $("messageInput").placeholder =
      mode === "chat"
        ? "写下想说的话…"
        : "粘贴要处理的文本，也可以附上修改要求…";
    for (const b of document.querySelectorAll("[data-mode]"))
      b.dataset.active = String(b.dataset.mode === mode);
    $("messages").scrollTop = $("messages").scrollHeight;
  }
  function fillSettings(cfg) {
    settings = cfg;
    $("baseUrl").value = cfg.baseUrl;
    $("model").value = cfg.model;
    $("apiKey").value = "";
    $("saveHistory").checked = cfg.saveHistory;
    $("connectionBadge").textContent = cfg.hasKey
      ? "已配置 · " + cfg.model
      : "尚未保存密钥";
    $("keyInfo").textContent =
      (cfg.hasKey ? "已保存加密密钥，留空即可保留。" : "尚未保存密钥。") +
      " 更换服务商地址请重新填写；本机服务可留空。";
  }
  async function save() {
    if (active) return false;
    try {
      const result = await api.save({
        mode,
        baseUrl: $("baseUrl").value.trim(),
        model: $("model").value.trim(),
        apiKey: $("apiKey").value.trim(),
        saveHistory: $("saveHistory").checked,
        proactive: false,
      });
      if (!result.ok) throw new Error(result.error);
      fillSettings(result.config);
      $("configStatus").textContent = "设置已保存。连接测试会发送一条短消息。";
      return true;
    } catch (e) {
      $("configStatus").textContent = e.message;
      return false;
    }
  }
  async function send(test = false) {
    if (active || loading) return;
    const text = test ? "" : $("messageInput").value.trim();
    if (!test && !text) {
      status("请先输入内容。");
      return;
    }
    const task = { id: crypto.randomUUID(), test, mode, text, entry: null };
    active = task;
    setBusy(true);
    if (!test) {
      history.push({ role: "user", mode, content: text });
      render();
      task.entry = addMessage({
        role: "assistant",
        mode,
        content: "",
        partial: true,
      });
      task.entry.body.textContent = "正在想…";
    }
    status(test ? "正在测试已保存的连接…" : "正在连接…");
    if (test) $("configStatus").textContent = "正在测试已保存的连接…";
    try {
      const result = await api.start({ id: task.id, mode, text, test });
      if (!result.ok) throw new Error(result.error);
      if (!test && $("messageInput").value.trim() === text)
        $("messageInput").value = "";
    } catch (e) {
      if (active !== task) return;
      if (!test) {
        task.entry.node.remove();
        history.pop();
        render();
      }
      active = null;
      setBusy(false);
      status(e.message);
      if (test) $("configStatus").textContent = e.message;
      if (e.message.includes("密钥")) $("settingsPanel").hidden = false;
    }
  }
  api.onEvent((event) => {
    if (!active || event.id !== active.id) return;
    const task = active;
    if (event.type === "delta") {
      if (task.test) return;
      if (!task.content) {
        task.entry.body.textContent = "";
        status("正在回复…");
      }
      task.content = (task.content || "") + event.text;
      task.entry.body.textContent = task.content;
      const list = $("messages");
      if (list.scrollHeight - list.scrollTop - list.clientHeight < 220)
        list.scrollTop = list.scrollHeight;
      return;
    }
    if (!["done", "stopped", "error"].includes(event.type)) return;
    const text =
      event.type === "done"
        ? task.test
          ? "连接成功，模型已正常返回文字。"
          : event.limited
            ? "回复达到长度上限，内容已保留。"
            : "回复完成。"
        : event.error;
    if (task.test) $("configStatus").textContent = text;
    else if (task.content) {
      const record = {
        role: "assistant",
        mode: task.mode,
        content: task.content,
        ...(event.type !== "done" ? { partial: true } : {}),
      };
      history.push(record);
      if (event.type === "done")
        task.entry.footer.querySelector(".partial")?.remove();
    } else {
      task.entry.node.remove();
      task.entry = null;
    }
    status(event.memoryNotice ? text + " " + event.memoryNotice : text);
    active = null;
    setBusy(false);
    if (task.mode === "chat")
      api
        .state("chat")
        .then((state) => {
          if (state) {
            memories = state.memories || [];
            renderMemories();
          }
        })
        .catch(() => {});
  });
  const changeMode = async (next) => {
    if (!Object.hasOwn(labels, next)) return;
    if (active) {
      status("请先停止当前回复，再切换模式。");
      return;
    }
    drafts[mode] = $("messageInput").value;
    mode = next;
    $("messageInput").value = drafts[mode];
    $("memoryPanel").hidden = true;
    const version = ++loadVersion;
    loading = true;
    setBusy(true);
    $("stop").hidden = true;
    history = [];
    render();
    try {
      const state = await api.state(next);
      if (version !== loadVersion) return;
      if (!state) throw new Error("无法读取当前记录。");
      history = state.history;
      memories = state.memories || [];
      fillSettings(state.config);
      render();
      renderMemories();
      status("Enter 发送 · Shift + Enter 换行");
    } catch (error) {
      if (version === loadVersion) status(error.message);
    } finally {
      if (version === loadVersion) {
        loading = false;
        setBusy(false);
      }
    }
  };
  api.onMode(changeMode);
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.onclick = () => changeMode(b.dataset.mode)));
  document.querySelectorAll("[data-suggestion]").forEach(
    (b) =>
      (b.onclick = () => {
        $("messageInput").value = b.dataset.suggestion;
        $("messageInput").focus();
      }),
  );
  $("send").onclick = () => send();
  $("testConnection").onclick = () => send(true);
  $("saveConfig").onclick = save;
  $("stop").onclick = () => {
    if (active) {
      status("正在停止…");
      api.cancel(active.id);
    }
  };
  $("settingsToggle").onclick = () => {
    $("memoryPanel").hidden = true;
    $("settingsPanel").hidden = !$("settingsPanel").hidden;
  };
  $("closeSettings").onclick = () => {
    $("settingsPanel").hidden = true;
  };
  $("messageInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  $("clearHistory").onclick = async () => {
    if (
      loading ||
      !confirm("清空「" + labels[mode] + "」的记录？其他模式和陪伴记忆会保留。")
    )
      return;
    const state = await api.clear(mode);
    active = null;
    setBusy(false);
    history = state?.history || [];
    render();
    status(labels[mode] + "记录已清空。");
  };
  $("forgetKey").onclick = async () => {
    if (active) return;
    const result = await api.save({ ...settings, mode, clearKey: true });
    if (result.ok) {
      fillSettings(result.config);
      $("configStatus").textContent = "已删除保存的密钥。";
    } else $("configStatus").textContent = result.error;
  };
  function resetMemoryForm() {
    editMemoryId = null;
    $("memoryText").value = "";
    $("saveMemory").textContent = "记住";
    $("cancelMemoryEdit").hidden = true;
  }
  function renderMemories() {
    const list = $("memoryList");
    list.replaceChildren();
    if (!memories.length) {
      const p = document.createElement("p");
      p.className = "memory-note";
      p.textContent =
        "还没有指定记忆。也可以在聊天中说「记住：喜欢安静的雨天」。";
      list.append(p);
    }
    for (const memory of memories) {
      const row = document.createElement("div"),
        text = document.createElement("p"),
        label = document.createElement("small"),
        content = document.createElement("span");
      row.className = "memory-row";
      label.textContent = {
        nickname: "称呼",
        preference: "喜好",
        topic: "近况",
      }[memory.kind];
      content.textContent = memory.text;
      text.append(label, content);
      const edit = document.createElement("button"),
        forget = document.createElement("button");
      edit.textContent = "修改";
      forget.textContent = "忘记";
      edit.onclick = () => {
        editMemoryId = memory.id;
        $("memoryKind").value = memory.kind;
        $("memoryText").value = memory.text;
        $("saveMemory").textContent = "保存修改";
        $("cancelMemoryEdit").hidden = false;
      };
      forget.onclick = () => mutateMemory({ action: "forget", id: memory.id });
      row.append(text, edit, forget);
      list.append(row);
    }
    if (active || loading) setBusy(true);
  }
  async function mutateMemory(input) {
    if (active || loading) {
      $("memoryStatus").textContent = "请先停止当前回复。";
      return;
    }
    try {
      const result = await api.memory(input);
      if (!result.ok) throw new Error(result.error);
      memories = result.memories;
      resetMemoryForm();
      renderMemories();
      $("memoryStatus").textContent =
        input.action === "save" ? "已记住。" : "已忘记。";
    } catch (error) {
      $("memoryStatus").textContent = error.message;
    }
  }
  $("memoryToggle").onclick = () => {
    $("settingsPanel").hidden = true;
    $("memoryPanel").hidden = !$("memoryPanel").hidden;
    renderMemories();
  };
  $("closeMemory").onclick = () => {
    $("memoryPanel").hidden = true;
  };
  $("cancelMemoryEdit").onclick = resetMemoryForm;
  $("memoryForm").onsubmit = (event) => {
    event.preventDefault();
    mutateMemory({
      action: "save",
      id: editMemoryId,
      kind: $("memoryKind").value,
      text: $("memoryText").value,
    });
  };
  $("forgetAllMemory").onclick = () => {
    if (confirm("忘记全部陪伴记忆？聊天记录会保留。"))
      mutateMemory({ action: "clear" });
  };
  changeMode("chat");
})();
