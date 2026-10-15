const fs = require("node:fs"),
  path = require("node:path");
const { config, cleanHistory, DEFAULT_CONFIG } = require("./core/chat-policy");
const { randomUUID } = require("node:crypto");
const { normalizeMemory, cleanMemories } = require("./core/chat-memory");
const HISTORY_FILES = Object.freeze({
  chat: "chat-history.json",
  paper: "paper-history.json",
  polish: "polish-history.json",
  summary: "summary-history.json",
});
function createChatStore(folder, safeStorage) {
  const cfgPath = path.join(folder, "chat-config.json"),
    historyPath = path.join(folder, "chat-history.json"),
    memoryPath = path.join(folder, "chat-memories.json");
  const read = (file) => {
    try {
      if (fs.statSync(file).size > 2 * 1024 * 1024) return null;
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };
  const write = (file, value) => {
    const temp = file + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temp, file);
  };
  const raw = read(cfgPath) || {};
  let settings;
  try {
    settings = config(raw);
  } catch {
    settings = { ...DEFAULT_CONFIG };
  }
  const histories = Object.fromEntries(
    Object.keys(HISTORY_FILES).map((mode) => [mode, []]),
  );
  let memories = cleanMemories(read(memoryPath));
  const legacy = cleanHistory(read(historyPath));
  if (settings.saveHistory) {
    for (const [mode, file] of Object.entries(HISTORY_FILES)) {
      const saved =
        mode === "chat" ? legacy : cleanHistory(read(path.join(folder, file)));
      const old = legacy.filter((m) => m.mode === mode && mode !== "chat");
      const current = saved.filter((m) => m.mode === mode);
      // Retry safely if a previous migration wrote a destination but was interrupted.
      const alreadyMigrated =
        old.length > 0 &&
        old.every(
          (m, index) =>
            current[index] &&
            JSON.stringify(current[index]) === JSON.stringify(m),
        );
      histories[mode] = cleanHistory(
        alreadyMigrated ? current : [...old, ...current],
      );
    }
    // Migrate the old mixed file only after the destination files are written.
    if (legacy.some((m) => m.mode !== "chat")) {
      for (const mode of ["paper", "polish", "summary"]) persist(mode);
      persist("chat");
    }
  } else
    for (const file of Object.values(HISTORY_FILES))
      fs.rmSync(path.join(folder, file), { force: true });
  let secret = typeof raw.encryptedKey === "string" ? raw.encryptedKey : "";
  function persist(mode) {
    const file = path.join(folder, HISTORY_FILES[mode]);
    if (settings.saveHistory && histories[mode].length)
      write(file, histories[mode]);
    else fs.rmSync(file, { force: true });
  }
  function validMode(mode) {
    if (!Object.hasOwn(HISTORY_FILES, mode))
      throw new Error("记录类型不正确。");
  }
  function key() {
    if (!secret) return "";
    try {
      return safeStorage.decryptString(Buffer.from(secret, "base64"));
    } catch {
      throw new Error("无法解密密钥，请在本机重新填写。");
    }
  }
  return {
    get state() {
      return {
        config: { ...settings, hasKey: !!secret },
        history: Object.values(histories).flat(),
        memories: cleanMemories(memories),
      };
    },
    key,
    stateFor(mode) {
      validMode(mode);
      return {
        config: this.state.config,
        history: cleanHistory(histories[mode]),
        memories: mode === "chat" ? cleanMemories(memories) : [],
      };
    },
    remember(input) {
      const clean = normalizeMemory(input);
      const id = input.id;
      if (id && !memories.some((m) => m.id === id))
        throw new Error("这条记忆已不存在，请刷新后重试。");
      if (
        !id &&
        memories.some((m) => m.kind === clean.kind && m.text === clean.text)
      )
        return cleanMemories(memories);
      if (!id && memories.length >= 32)
        throw new Error("最多保留 32 条记忆，请先忘记不需要的内容。");
      let next = memories.filter(
        (m) =>
          m.id !== id && (clean.kind !== "nickname" || m.kind !== "nickname"),
      );
      next.push({ id: id || randomUUID(), ...clean });
      write(memoryPath, next);
      memories = next;
      return cleanMemories(memories);
    },
    forget(id) {
      if (
        id !== null &&
        (typeof id !== "string" || !memories.some((m) => m.id === id))
      )
        throw new Error("找不到这条记忆。");
      const next = id === null ? [] : memories.filter((m) => m.id !== id);
      if (next.length) write(memoryPath, next);
      else fs.rmSync(memoryPath, { force: true });
      memories = next;
      return cleanMemories(memories);
    },
    save(input) {
      const next = config(input);
      let encrypted =
        new URL(next.baseUrl).origin === new URL(settings.baseUrl).origin
          ? secret
          : "";
      if (input.clearKey === true) encrypted = "";
      if (typeof input.apiKey === "string" && input.apiKey.trim()) {
        const plain = input.apiKey.trim();
        if (plain.length > 2048 || !/^[\x21-\x7e]+$/.test(plain))
          throw new Error("密钥格式不正确。");
        if (!safeStorage.isEncryptionAvailable())
          throw new Error("本机加密服务不可用，密钥未保存。");
        encrypted = safeStorage.encryptString(plain).toString("base64");
      }
      write(cfgPath, { ...next, encryptedKey: encrypted });
      settings = next;
      secret = encrypted;
      for (const mode of Object.keys(HISTORY_FILES)) persist(mode);
      return this.state;
    },
    append(messages) {
      for (const mode of Object.keys(HISTORY_FILES)) {
        const additions = cleanHistory(messages).filter((m) => m.mode === mode);
        if (!additions.length) continue;
        histories[mode] = cleanHistory([...histories[mode], ...additions]);
        persist(mode);
      }
    },
    clear(mode = null) {
      if (mode !== null) validMode(mode);
      for (const current of mode === null
        ? Object.keys(HISTORY_FILES)
        : [mode]) {
        histories[current] = [];
        persist(current);
      }
      return this.state;
    },
  };
}
module.exports = { createChatStore, HISTORY_FILES };
