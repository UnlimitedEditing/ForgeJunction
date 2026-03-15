import { ipcMain, dialog, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { pathToFileURL } from 'url'

export interface DriveInfo {
  path: string
  label: string
  total: number
  free: number
  used: number
}

export interface ScannedFile {
  filePath: string
  fileUrl: string
  name: string
  ext: string
  mediaType: 'video' | 'image'
  size: number
  mtime: number
}

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.wmv'])
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])

function getDrives(): DriveInfo[] {
  if (process.platform === 'win32') {
    try {
      const result = spawnSync('wmic', [
        'logicaldisk', 'get', 'caption,size,freespace,volumename', '/format:csv'
      ], { encoding: 'utf-8', timeout: 10000 })

      if (result.error || result.status !== 0) return []

      const lines = (result.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      // First non-empty line is header (Node,Caption,FreeSpace,Size,VolumeName), skip it
      const dataLines = lines.slice(1)

      const drives: DriveInfo[] = []
      for (const line of dataLines) {
        const parts = line.split(',')
        // CSV columns: Node, Caption, FreeSpace, Size, VolumeName
        if (parts.length < 5) continue
        const caption = (parts[1] ?? '').trim()
        const freeStr = (parts[2] ?? '').trim()
        const sizeStr = (parts[3] ?? '').trim()
        const volumeName = (parts[4] ?? '').trim()

        if (!caption || !sizeStr || sizeStr === '0' || sizeStr === '') continue

        const total = parseInt(sizeStr, 10)
        const free = parseInt(freeStr, 10)
        if (isNaN(total) || total === 0) continue
        const used = total - (isNaN(free) ? 0 : free)

        const drivePath = caption.endsWith('\\') ? caption : caption + '\\'
        const label = volumeName ? `${caption} (${volumeName})` : caption

        drives.push({ path: drivePath, label, total, free: isNaN(free) ? 0 : free, used })
      }

      return drives.sort((a, b) => a.path.localeCompare(b.path))
    } catch {
      return []
    }
  } else {
    // Non-Windows: use df -Pk
    try {
      const result = spawnSync('df', ['-Pk'], { encoding: 'utf-8', timeout: 10000 })
      if (result.error || result.status !== 0) return []

      const lines = (result.stdout ?? '').split('\n').slice(1).filter(Boolean)
      const drives: DriveInfo[] = []

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 6) continue
        const totalKB = parseInt(parts[1], 10)
        const usedKB = parseInt(parts[2], 10)
        const freeKB = parseInt(parts[3], 10)
        const mountPoint = parts[5]
        if (isNaN(totalKB) || totalKB === 0) continue

        drives.push({
          path: mountPoint,
          label: mountPoint,
          total: totalKB * 1024,
          free: freeKB * 1024,
          used: usedKB * 1024,
        })
      }

      return drives.sort((a, b) => a.path.localeCompare(b.path))
    } catch {
      return []
    }
  }
}

function scanDir(dirPath: string): { path: string; files: ScannedFile[] } {
  const files: ScannedFile[] = []
  const FILE_CAP = 1000
  const MAX_DEPTH = 4

  function recurse(currentPath: string, depth: number): void {
    if (depth > MAX_DEPTH || files.length >= FILE_CAP) return

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (files.length >= FILE_CAP) break
      const fullPath = path.join(currentPath, entry.name)

      if (entry.isDirectory()) {
        recurse(fullPath, depth + 1)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        let mediaType: 'video' | 'image' | null = null
        if (VIDEO_EXTS.has(ext)) mediaType = 'video'
        else if (IMAGE_EXTS.has(ext)) mediaType = 'image'
        if (!mediaType) continue

        try {
          const stat = fs.statSync(fullPath)
          files.push({
            filePath: fullPath,
            fileUrl: pathToFileURL(fullPath).href,
            name: entry.name,
            ext,
            mediaType,
            size: stat.size,
            mtime: stat.mtimeMs,
          })
        } catch {
          // skip files we can't stat
        }
      }
    }
  }

  recurse(dirPath, 1)
  files.sort((a, b) => b.mtime - a.mtime)

  return { path: dirPath, files }
}

export function registerStorageIpc(): void {
  ipcMain.handle('storage:get-drives', () => {
    return getDrives()
  })

  ipcMain.handle('storage:scan-dir', (_event, dirPath: string) => {
    return scanDir(dirPath)
  })

  ipcMain.handle('storage:pick-dir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('storage:move-dir', (_event, { sourcePath, targetParent }: { sourcePath: string; targetParent: string }) => {
    const dirName = path.basename(sourcePath)
    const dest = path.join(targetParent, dirName)
    fs.cpSync(sourcePath, dest, { recursive: true })
    fs.rmSync(sourcePath, { recursive: true, force: true })
    return { newPath: dest }
  })

  ipcMain.handle('storage:open-in-explorer', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
}
