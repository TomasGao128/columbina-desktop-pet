const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('moonBurst', {
  ready: (id) => ipcRenderer.send('burst-ready', id),
  failed: (id) => ipcRenderer.send('burst-load-error', id),
});
