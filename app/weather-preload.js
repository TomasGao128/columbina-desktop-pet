const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("weather", {
  get: () => ipcRenderer.invoke("weather-get"),
  save: (input) => ipcRenderer.invoke("weather-save", input),
  onRender: (fn) => ipcRenderer.on("weather-render", (_e, data) => fn(data)),
  onSettings: (fn) =>
    ipcRenderer.on("weather-settings", (_e, data) => fn(data)),
});
