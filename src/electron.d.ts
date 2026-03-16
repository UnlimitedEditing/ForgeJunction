export {}

declare global {
  interface Window {
    electron: {
      openExternal: (url: string) => Promise<void>

      // Auto-update
      onUpdateChecking: (cb: () => void) => () => void
      onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string | null }) => void) => () => void
      onUpdateNotAvailable: (cb: () => void) => () => void
      onUpdateProgress: (cb: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => () => void
      onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void
      onUpdateError: (cb: (err: { message: string }) => void) => () => void
      installUpdate: () => void
      dismissUpdate: () => void
      onOpenDebugProtocol: (callback: () => void) => () => void
      onOpenDebugLog: (callback: () => void) => () => void
      writeDebugLog: (content: string) => Promise<string>
      readDebugLog: () => Promise<{ path: string; content: string } | null>
      getLogPath: () => Promise<string>
      onThemeChange: (callback: (theme: string) => void) => () => void
      reportTheme: (theme: string) => Promise<void>
      // Debug / Reporting
      sendLogs: (logs: object[]) => void
      exportReport: (rendererMeta: object) => Promise<{ success: boolean; filePath?: string; reportId?: string; error?: string }>
      getSystemInfo: () => Promise<import('../electron/debugReporter').SystemInfo>
      sendCrashReport: (rendererMeta: object, auto?: boolean) => Promise<{ localPath: string; backend: { success: boolean; error?: string; serverId?: string }; reportId: string }>
      onOpenDebugReport: (callback: () => void) => () => void

      // Launcher
      sendLaunch:    () => void
      sendQuit:      () => void
      fetchFeed:     () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>
      getAppVersion: () => Promise<string>

      auth: {
        hasKey: () => Promise<boolean>
        getKey: () => Promise<string | null>
        setKey: (key: string) => Promise<boolean>
        deleteKey: () => Promise<boolean>
        validateKey: (key: string) => Promise<{ valid: boolean; error: string | null; timedOut?: boolean }>
      }

      video: {
        probe: (url: string) => Promise<{ duration: number; width: number; height: number; hasAudio: boolean }>
        export: (params: object) => Promise<{ outputPath: string }>
        getExportDir: () => Promise<string>
        onProgress: (cb: (data: { percent: number; timeStr: string }) => void) => () => void
      }

      storage: {
        getDrives: () => Promise<Array<{ path: string; label: string; total: number; free: number; used: number }>>
        scanDir: (path: string) => Promise<{ path: string; files: Array<{ filePath: string; fileUrl: string; name: string; ext: string; mediaType: 'video' | 'image'; size: number; mtime: number }> }>
        pickDir: () => Promise<string | null>
        moveDir: (sourcePath: string, targetParent: string) => Promise<{ newPath: string }>
        openInExplorer: (filePath: string) => Promise<void>
      }

    }
  }
}
