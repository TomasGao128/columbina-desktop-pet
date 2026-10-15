const { contextBridge, ipcRenderer, clipboard } = require("electron");
const subscribe = (name, fn) => {
  const listener = (_event, value) => fn(value);
  ipcRenderer.on(name, listener);
  return () => ipcRenderer.removeListener(name, listener);
};
contextBridge.exposeInMainWorld("petChat", {
  state: (mode = "chat") => ipcRenderer.invoke("chat-state", mode),
  save: (input) => ipcRenderer.invoke("chat-save", input),
  start: (input) => ipcRenderer.invoke("chat-start", input),
  cancel: (id) => ipcRenderer.invoke("chat-cancel", id),
  clear: (mode = "chat") => ipcRenderer.invoke("chat-clear", mode),
  memory: (input) => ipcRenderer.invoke("chat-memory", input),
  copy: (text) => {
    if (typeof text === "string" && text.length <= 64000)
      clipboard.writeText(text);
  },
  onEvent: (fn) => subscribe("chat-event", fn),
  onMode: (fn) => subscribe("chat-mode", fn),
});
