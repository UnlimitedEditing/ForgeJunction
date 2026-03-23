import { app, BrowserWindow, shell, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { createServer as createNetServer } from 'net'
import { createServer as createHttpServer } from 'http'
import { extname } from 'path'
import { isApiKeyStored, storeApiKey, retrieveApiKey, deleteApiKey } from './services/keystore'
import { patchMainConsole, registerIpcHandlers } from './debugReporter'
import { autoUpdater } from 'electron-updater'
import { createLauncherWindow } from './launcher'
import { initInstanceTracker, pingTracker } from './instanceTracker'
import { registerVideoIpc } from './videoProcessor'
import { registerStorageIpc } from './storageManager'

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

const isDev = !app.isPackaged

// ── Omniclip embedded server ───────────────────────────────────────────────────

// Dev: run `npx serve x -p 3000` in alt-editor/omniclip-main (or `npm start` + serve)
let tooscutUrl = 'http://localhost:3000' // dev default
let omniclipServer: ReturnType<typeof createHttpServer> | null = null

const OMNICLIP_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mp3':  'audio/mpeg',
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      srv.close(() => resolve(typeof addr === 'object' && addr ? addr.port : 0))
    })
    srv.on('error', reject)
  })
}

async function startOmniclipServer(): Promise<void> {
  if (isDev) return // dev: serve x/ manually on port 3000
  const staticDir = join(process.resourcesPath, 'omniclip')
  if (!existsSync(staticDir)) {
    console.warn('[Omniclip] static dir not found:', staticDir)
    return
  }
  const port = await getFreePort()
  tooscutUrl = `http://127.0.0.1:${port}`
  omniclipServer = createHttpServer((req, res) => {
    let filePath = join(staticDir, (req.url ?? '/').split('?')[0])
    // Fall back to index.html for directory requests or missing files
    try {
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        filePath = join(staticDir, 'index.html')
      }
    } catch {
      filePath = join(staticDir, 'index.html')
    }
    const mime = OMNICLIP_MIME[extname(filePath)] ?? 'application/octet-stream'
    // COOP/COEP headers are intentionally NOT set here — coi-serviceworker.js
    // handles cross-origin isolation transparently so CDN resources (PixiJS,
    // Shoelace) can load on the first visit before the SW is active.
    res.writeHead(200, { 'Content-Type': mime })
    res.end(readFileSync(filePath))
  })
  omniclipServer.listen(port, '127.0.0.1', () => {
    console.log(`[Omniclip] static server on ${tooscutUrl}`)
  })
  omniclipServer.on('error', (e) => console.error('[Omniclip] server error:', e))
}

app.on('will-quit', () => {
  if (omniclipServer) {
    omniclipServer.close()
    omniclipServer = null
  }
})

let currentTheme = 'default'
let launcherWin: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#0a0a0c',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32' ? {
      titleBarOverlay: {
        color: '#0a0a0c',
        symbolColor: '#ff6b2b',
        height: 40,
      },
    } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // webSecurity must stay false: the Graydient API doesn't send CORS headers
      // (it's a native-app API). The "Disabled webSecurity" dev warning is
      // expected and intentional — it does NOT appear in packaged builds.
      webSecurity: false,
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

  return win
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
        },
        { type: 'separator' },
        {
          label: 'Export Debug Report',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('debug:open-dialog')
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

  // Auto-update controls
  ipcMain.on('update:install-now', () => {
    try { autoUpdater.quitAndInstall(false, true) } catch (e) { console.error('[AutoUpdater]', e) }
  })

  ipcMain.on('update:dismiss', () => { /* acknowledged */ })

  // Launcher IPC
  ipcMain.on('launcher:launch', () => {
    const mainWindow = createMainWindow()
    setupAutoUpdater(mainWindow)
    launcherWin?.close()
    launcherWin = null
  })

  ipcMain.on('launcher:quit', () => {
    app.quit()
  })

  ipcMain.handle('launcher:fetch-feed', async () => {
    try {
      const res = await fetch(
        'https://raw.githubusercontent.com/UnlimitedEditing/ForgeJunction/main/feed.json',
        { signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { ok: true, data: await res.json() }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('editor:get-url', () => tooscutUrl)

  // Suppress unused import warning — isApiKeyStored used for future extensibility
  void isApiKeyStored

  // Video editor IPC
  registerVideoIpc()

  // Storage manager IPC
  registerStorageIpc()
}

// ── Auto Updater ──────────────────────────────────────────────────────────────

function setupAutoUpdater(win: BrowserWindow): void {
  // Don't run the updater in dev — app isn't signed and autoUpdater will throw
  if (isDev) return

  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      win.webContents.send('update:checking')
    })

    autoUpdater.on('update-available', (info) => {
      win.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes ?? null,
      })
    })

    autoUpdater.on('update-not-available', () => {
      win.webContents.send('update:not-available')
    })

    autoUpdater.on('download-progress', (progress) => {
      win.webContents.send('update:progress', progress)
    })

    autoUpdater.on('update-downloaded', (info) => {
      win.webContents.send('update:downloaded', { version: info.version })
      pingTracker('update-downloaded', info.version)
    })

    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater] error:', err)
      win.webContents.send('update:error', { message: err.message })
    })

    // Initial check after 10 s to avoid slowing startup
    setTimeout(() => {
      try { autoUpdater.checkForUpdates() } catch (e) { console.error('[AutoUpdater]', e) }
    }, 10_000)

    // Repeat every 20 minutes
    setInterval(() => {
      try { autoUpdater.checkForUpdates() } catch (e) { console.error('[AutoUpdater]', e) }
    }, 1_200_000)
  } catch (e) {
    console.error('[AutoUpdater] setup failed:', e)
  }
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // The Graydient API doesn't send CORS headers (it's not a web-facing origin).
  // Inject them for the renderer so fetch() calls work with webSecurity enabled.
  await startOmniclipServer()
  await initInstanceTracker()
  pingTracker('launch')
  patchMainConsole()
  registerIpcHandlers()
  buildMenu()
  setupIpc()

  const showLauncher = app.isPackaged || process.env.FJ_SHOW_LAUNCHER === 'true'

  if (showLauncher) {
    launcherWin = createLauncherWindow()
    launcherWin.on('closed', () => {
      // If the launcher is closed without launching, quit
      if (BrowserWindow.getAllWindows().length === 0) app.quit()
    })
  } else {
    const mainWindow = createMainWindow()
    setupAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
