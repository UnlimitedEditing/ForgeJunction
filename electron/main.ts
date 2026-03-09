import { app, BrowserWindow, shell, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { isApiKeyStored, storeApiKey, retrieveApiKey, deleteApiKey } from './services/keystore'

const isDev = !app.isPackaged

let currentTheme = 'default'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }
}

// ── Application Menu ──────────────────────────────────────────────────────────

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Theme',
          submenu: [
            {
              label: 'Industrial (Default)',
              type: 'radio',
              checked: currentTheme === 'default',
              click: () => {
                currentTheme = 'default'
                BrowserWindow.getFocusedWindow()?.webContents.send('theme:change', 'default')
                buildMenu()
              }
            },
            {
              label: 'Discord (Purple)',
              type: 'radio',
              checked: currentTheme === 'discord',
              click: () => {
                currentTheme = 'discord'
                BrowserWindow.getFocusedWindow()?.webContents.send('theme:change', 'discord')
                buildMenu()
              }
            },
            {
              label: 'Pirate (Aetherpunk)',
              type: 'radio',
              checked: currentTheme === 'pirate',
              click: () => {
                currentTheme = 'pirate'
                BrowserWindow.getFocusedWindow()?.webContents.send('theme:change', 'pirate')
                buildMenu()
              }
            }
          ]
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Utilities',
      submenu: [
        {
          label: 'Run Workflow Debug Protocol',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('open-debug-protocol')
          }
        },
        {
          label: 'View Debug Log',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('open-debug-log')
          }
        },
        { type: 'separator' },
        {
          label: 'Open Log File Location',
          click: () => {
            const logPath = join(app.getPath('userData'), 'logs')
            shell.openPath(logPath)
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Forge Junction',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('open-about')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

function setupIpc(): void {
  const logDir = join(app.getPath('userData'), 'logs')

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('debug:writeLog', (_event, content: string) => {
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const logFile = join(logDir, `debug-${timestamp}.log`)
    writeFileSync(logFile, content, 'utf-8')
    return logFile
  })

  ipcMain.handle('debug:readLog', () => {
    if (!existsSync(logDir)) return null
    const files = readdirSync(logDir)
      .filter((f) => f.startsWith('debug-') && f.endsWith('.log'))
      .sort()
      .reverse()
    if (files.length === 0) return null
    const latest = join(logDir, files[0])
    return { path: latest, content: readFileSync(latest, 'utf-8') }
  })

  ipcMain.handle('debug:getLogPath', () => logDir)

  // Theme sync — renderer reports its persisted theme on startup so the
  // menu checkmarks reflect the stored preference without extra IPC calls
  ipcMain.handle('theme:report', (_event, theme: string) => {
    currentTheme = theme
    buildMenu()
  })

  // ── Auth / key management ──────────────────────────────────────────────────

  ipcMain.handle('auth:hasKey', () => {
    const key = retrieveApiKey()
    return key !== null && key.length > 0
  })

  ipcMain.handle('auth:getKey', () => {
    return retrieveApiKey()
  })

  ipcMain.handle('auth:setKey', (_event, key: string) => {
    storeApiKey(key)
    return true
  })

  ipcMain.handle('auth:deleteKey', () => {
    deleteApiKey()
    return true
  })

  ipcMain.handle('auth:validateKey', async (_event, key: string) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch('https://app.graydient.ai/api/v3/workflows/', {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/vnd.api+json',
          Accept: 'application/vnd.api+json',
          Authorization: `Bearer ${key}`
        }
      })
      clearTimeout(timeout)
      if (response.status === 200) {
        return { valid: true, error: null }
      } else if (response.status === 401) {
        return { valid: false, error: 'Invalid API key. Please check and try again.' }
      } else {
        return { valid: false, error: `Unexpected response (${response.status}). The Graydient server may be down.` }
      }
    } catch (e: unknown) {
      clearTimeout(timeout)
      if (e instanceof Error && e.name === 'AbortError') {
        return { valid: true, error: null, timedOut: true }
      }
      return { valid: false, error: 'Could not connect to Graydient. Check your internet connection.' }
    }
  })

  // Suppress unused import warning — isApiKeyStored used for future extensibility
  void isApiKeyStored
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  buildMenu()
  setupIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
