const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 920, minWidth: 1280, minHeight: 760,
    backgroundColor: '#07090d', title: 'Apex Dynasty', show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

ipcMain.on('toggle-fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
ipcMain.on('quit', () => app.quit());

if (process.platform === 'darwin') {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Apex Dynasty', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Modifica', submenu: [{ role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ]));
} else Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
