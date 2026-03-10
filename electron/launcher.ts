import { BrowserWindow, app } from 'electron'
import { join } from 'path'

const isDev = !app.isPackaged

export function createLauncherWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 680,
    resizable: false,
    frame: false,
    center: true,
    backgroundColor: '#080a0c',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    if (isDev) win.webContents.openDevTools({ mode: 'detach' })
  })

  if (isDev) {
    const base = process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173'
    win.loadURL(`${base}/launcher.html`)
  } else {
    win.loadFile(join(__dirname, '../../dist/launcher.html'))
  }

  return win
}
