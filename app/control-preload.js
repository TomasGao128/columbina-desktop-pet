const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("control", {
  command: (input) => ipcRenderer.invoke("control-command", input),
});
