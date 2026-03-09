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
