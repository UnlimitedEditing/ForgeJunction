export {}

declare global {
  interface Window {
    electron: {
      openExternal: (url: string) => Promise<void>
      onOpenDebugProtocol: (callback: () => void) => () => void
      onOpenDebugLog: (callback: () => void) => () => void
      writeDebugLog: (content: string) => Promise<string>
      readDebugLog: () => Promise<{ path: string; content: string } | null>
      getLogPath: () => Promise<string>
      onThemeChange: (callback: (theme: string) => void) => () => void
      reportTheme: (theme: string) => Promise<void>
      auth: {
        hasKey: () => Promise<boolean>
        getKey: () => Promise<string | null>
        setKey: (key: string) => Promise<boolean>
        deleteKey: () => Promise<boolean>
        validateKey: (key: string) => Promise<{ valid: boolean; error: string | null; timedOut?: boolean }>
      }
    }
  }
}
