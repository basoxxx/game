const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('apex', {
  desktop: true,
  platform: process.platform,
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  quit: () => ipcRenderer.send('quit'),
});
