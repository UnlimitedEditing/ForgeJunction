import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Menu event listeners — return cleanup functions
  onOpenDebugProtocol: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('open-debug-protocol', listener)
    return () => ipcRenderer.removeListener('open-debug-protocol', listener)
  },
  onOpenDebugLog: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('open-debug-log', listener)
    return () => ipcRenderer.removeListener('open-debug-log', listener)
  },
  onThemeChange: (callback: (theme: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, theme: string) => callback(theme)
    ipcRenderer.on('theme:change', listener)
    return () => ipcRenderer.removeListener('theme:change', listener)
  },
  reportTheme: (theme: string): Promise<void> =>
    ipcRenderer.invoke('theme:report', theme),

  // Debug log file helpers
  writeDebugLog: (content: string): Promise<string> =>
    ipcRenderer.invoke('debug:writeLog', content),
  readDebugLog: (): Promise<{ path: string; content: string } | null> =>
    ipcRenderer.invoke('debug:readLog'),
  getLogPath: (): Promise<string> =>
    ipcRenderer.invoke('debug:getLogPath'),

  // Auto-update events
  onUpdateChecking: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('update:checking', listener)
    return () => ipcRenderer.removeListener('update:checking', listener)
  },
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string | null }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, info: { version: string; releaseNotes: string | null }) => cb(info)
    ipcRenderer.on('update:available', listener)
    return () => ipcRenderer.removeListener('update:available', listener)
  },
  onUpdateNotAvailable: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('update:not-available', listener)
    return () => ipcRenderer.removeListener('update:not-available', listener)
  },
  onUpdateProgress: (cb: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => cb(progress)
    ipcRenderer.on('update:progress', listener)
    return () => ipcRenderer.removeListener('update:progress', listener)
  },
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, info: { version: string }) => cb(info)
    ipcRenderer.on('update:downloaded', listener)
    return () => ipcRenderer.removeListener('update:downloaded', listener)
  },
  onUpdateError: (cb: (err: { message: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, err: { message: string }) => cb(err)
    ipcRenderer.on('update:error', listener)
    return () => ipcRenderer.removeListener('update:error', listener)
  },
  installUpdate: () => ipcRenderer.send('update:install-now'),
  dismissUpdate: () => ipcRenderer.send('update:dismiss'),

  // Debug / Reporting
  sendLogs: (logs: object[]) => {
    ipcRenderer.send('debug:renderer-logs', logs)
  },
  exportReport: (rendererMeta: object): Promise<{ success: boolean; filePath?: string; reportId?: string; error?: string }> => {
    return ipcRenderer.invoke('debug:export-report', rendererMeta)
  },
  getSystemInfo: (): Promise<object> => {
    return ipcRenderer.invoke('debug:system-info')
  },
  sendCrashReport: (rendererMeta: object, auto = false): Promise<{ localPath: string; backend: object; reportId: string }> => {
    return ipcRenderer.invoke('debug:send-crash-report', { rendererMeta, auto })
  },
  onOpenDebugReport: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('debug:open-dialog', listener)
    return () => ipcRenderer.removeListener('debug:open-dialog', listener)
  },

  // Auth / key management
  auth: {
    hasKey: (): Promise<boolean> => ipcRenderer.invoke('auth:hasKey'),
    getKey: (): Promise<string | null> => ipcRenderer.invoke('auth:getKey'),
    setKey: (key: string): Promise<boolean> => ipcRenderer.invoke('auth:setKey', key),
    deleteKey: (): Promise<boolean> => ipcRenderer.invoke('auth:deleteKey'),
    validateKey: (key: string): Promise<{ valid: boolean; error: string | null; timedOut?: boolean }> =>
      ipcRenderer.invoke('auth:validateKey', key),
  },
})

export type ElectronAPI = typeof import('./preload')
