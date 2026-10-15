const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const { layoutBurst } = require('./burst-layout');
const DURATION = 7800;
class BurstWindow {
  constructor(getPet, log) {
    this.getPet = getPet;
    this.log = log;
    this.session = null;
    ipcMain.on('burst-ready', (event, id) => {
      const session = this.session;
      if (
        !session ||
        session.ready ||
        event.sender !== session.window.webContents ||
        id !== session.id
      )
        return;
      clearTimeout(session.watchdog);
      session.window.showInactive();
      session.ready = true;
      this.notify('burst-started', { id: session.id });
      session.timer = setTimeout(() => this.stop('complete'), DURATION);
    });
    ipcMain.on('burst-load-error', (event, id) => {
      if (
        this.session &&
        event.sender === this.session.window.webContents &&
        id === this.session.id
      )
        this.stop('asset-error');
    });
  }
  notify(channel, payload) {
    const pet = this.getPet();
    if (pet && !pet.isDestroyed()) pet.webContents.send(channel, payload);
  }
  async start({ id, rect, opacity, sound, intensity = 2, reducedMotion = false }) {
    this.stop('replaced');
    const pet = this.getPet();
    if (!pet || pet.isDestroyed()) return false;
    const bounds = pet.getBounds();
    if (
      !rect ||
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.width > 2000 ||
      rect.height > 2000
    )
      return false;
    const display = screen.getDisplayMatching(bounds);
    const area = display.workArea;
    const scene = layoutBurst(area, {
      x: bounds.x + rect.x,
      y: bounds.y + rect.y,
      width: rect.width,
      height: rect.height,
    });
    const window = new BrowserWindow({
      ...area,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, 'burst-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });
    window.setIgnoreMouseEvents(true);
    const session = { window, id, ready: false, scene, area, ignoreMouse: true };
    this.session = session;
    session.watchdog = setTimeout(() => {
      if (this.session === session) this.stop('load-timeout');
    }, 6000);
    window.on('closed', () => {
      if (this.session === session) this.stop('closed');
    });
    window.webContents.on('render-process-gone', () => {
      if (this.session === session) this.stop('renderer-failed');
    });
    window.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) this.log('burst-renderer', message);
    });
    try {
      const query = Object.fromEntries(
        Object.entries({
          ...scene,
          id,
          opacity: Math.max(0.3, Math.min(1, Number(opacity) || 1)),
          sound: !!sound,
          intensity: [0, 1, 2].includes(intensity) ? intensity : 2,
          reducedMotion: reducedMotion === true,
        }).map(([k, v]) => [k, String(v)]),
      );
      await window.loadFile(path.join(__dirname, 'renderer/burst-effect.html'), { query });
      return this.session === session;
    } catch (error) {
      if (this.session === session) {
        this.log('burst-load', error);
        this.stop('load-error');
      }
      return false;
    }
  }
  stop(reason = 'canceled') {
    const session = this.session;
    if (!session) return;
    this.session = null;
    clearTimeout(session.timer);
    clearTimeout(session.watchdog);
    if (!session.window.isDestroyed()) session.window.destroy();
    this.notify('burst-finished', { id: session.id, reason });
  }
}
module.exports = { BurstWindow, DURATION };
