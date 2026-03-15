import React, { useEffect, useRef, useState } from 'react'
import { useStorageStore } from '@/stores/storage'

// ── Types (mirrored from main process) ────────────────────────────────────────

interface DriveInfo {
  path: string
  label: string
  total: number
  free: number
  used: number
}

interface ScannedFile {
  filePath: string
  fileUrl: string
  name: string
  ext: string
  mediaType: 'video' | 'image'
  size: number
  mtime: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB'
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'
  return (b / 1e3).toFixed(1) + ' KB'
}

// ── Video tile ────────────────────────────────────────────────────────────────

function VideoTile({ src, className }: { src: string; className?: string }): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  function drawFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = video.videoWidth || canvas.offsetWidth
    canvas.height = video.videoHeight || canvas.offsetHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current
    if (!video || !video.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    video.currentTime = ratio * video.duration
  }

  function handleMouseLeave() {
    const video = videoRef.current
    if (video) video.currentTime = 0
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    function onSeeked() { drawFrame() }
    function onLoaded() { setReady(true); drawFrame() }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('loadeddata', onLoaded)
    return () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('loadeddata', onLoaded)
    }
  }, [src])

  return (
    <div
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        muted
        playsInline
        className="absolute invisible w-0 h-0"
      />
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-cover ${ready ? '' : 'opacity-0'}`}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <span className="text-white/20 text-2xl">▶</span>
        </div>
      )}
    </div>
  )
}

// ── Storage media tile ────────────────────────────────────────────────────────

function StorageTile({ file }: { file: ScannedFile }): React.ReactElement {
  const [hovered, setHovered] = useState(false)

  function handleReveal(e: React.MouseEvent) {
    e.stopPropagation()
    window.electron.storage.openInExplorer(file.filePath)
  }

  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden cursor-default group ring-1 ring-white/10 hover:ring-white/30 transition-all"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Media */}
      {file.mediaType === 'video' ? (
        <VideoTile
          src={file.fileUrl}
          className="absolute inset-0 w-full h-full bg-neutral-800"
        />
      ) : (
        <img
          src={file.fileUrl}
          alt={file.name}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      )}

      {/* No-prompt badge */}
      <div className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/50 leading-none pointer-events-none">
        ⊘ no prompt
      </div>

      {/* Bottom overlay on hover */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 transition-transform duration-150 ${
          hovered ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <p className="text-white/80 text-xs font-mono truncate">{file.name}</p>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-white/40 text-[10px]">{formatBytes(file.size)}</span>
          <button
            onClick={handleReveal}
            className="text-[10px] text-brand hover:text-white transition-colors"
            title="Reveal in Explorer"
          >
            Reveal
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Drive bar ─────────────────────────────────────────────────────────────────

function DriveBar({ drive }: { drive: DriveInfo }): React.ReactElement {
  const pct = drive.total > 0 ? (drive.used / drive.total) * 100 : 0
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/70 font-mono truncate">{drive.label}</span>
        <span className="text-[10px] text-white/40 ml-2 whitespace-nowrap">
          {formatBytes(drive.used)} / {formatBytes(drive.total)}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ── StorageManager ─────────────────────────────────────────────────────────────

export default function StorageManager({ onClose }: { onClose: () => void }): React.ReactElement {
  const { watchedDirs, addDir, removeDir, moveDir } = useStorageStore()

  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [scannedFiles, setScannedFiles] = useState<Map<string, ScannedFile[]>>(new Map())
  const [scanning, setScanning] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all')

  // Load drives on mount
  useEffect(() => {
    window.electron.storage.getDrives().then(setDrives).catch(() => {})
  }, [])

  // Scan all watched dirs on mount (for persisted dirs)
  useEffect(() => {
    for (const dir of watchedDirs) {
      if (!scannedFiles.has(dir)) {
        scanDirectory(dir)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function scanDirectory(dirPath: string) {
    setScanning(prev => new Set(prev).add(dirPath))
    try {
      const result = await window.electron.storage.scanDir(dirPath)
      setScannedFiles(prev => {
        const next = new Map(prev)
        next.set(result.path, result.files)
        return next
      })
    } catch {
      // silently ignore scan errors
    } finally {
      setScanning(prev => {
        const next = new Set(prev)
        next.delete(dirPath)
        return next
      })
    }
  }

  async function handleAddDir() {
    const picked = await window.electron.storage.pickDir()
    if (!picked) return
    addDir(picked)
    scanDirectory(picked)
  }

  async function handleMoveDir(dirPath: string) {
    const targetParent = await window.electron.storage.pickDir()
    if (!targetParent) return
    try {
      const result = await window.electron.storage.moveDir(dirPath, targetParent)
      // Move scanned files entry
      setScannedFiles(prev => {
        const next = new Map(prev)
        const files = next.get(dirPath) ?? []
        next.delete(dirPath)
        next.set(result.newPath, files)
        return next
      })
      moveDir(dirPath, result.newPath)
    } catch (e) {
      console.error('Move failed', e)
    }
  }

  function handleRemoveDir(dirPath: string) {
    removeDir(dirPath)
    setScannedFiles(prev => {
      const next = new Map(prev)
      next.delete(dirPath)
      return next
    })
  }

  // Combine + filter all files
  const allFiles: ScannedFile[] = []
  for (const dir of watchedDirs) {
    const files = scannedFiles.get(dir) ?? []
    for (const f of files) {
      allFiles.push(f)
    }
  }

  const filtered = allFiles
    .filter(f => {
      if (filter !== 'all' && f.mediaType !== filter) return false
      if (search.trim() && !f.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
    .sort((a, b) => b.mtime - a.mtime)

  return (
    <div className="flex h-full w-full bg-neutral-900">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-20 text-neutral-500 hover:text-white transition-colors text-lg leading-none"
        title="Close Storage Manager"
      >
        ✕
      </button>

      {/* Left sidebar */}
      <aside className="w-[200px] flex-shrink-0 border-r border-white/10 bg-neutral-950 flex flex-col overflow-y-auto">
        <div className="p-3 border-b border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">Drives</p>
          {drives.length === 0 ? (
            <p className="text-xs text-white/20">No drives detected</p>
          ) : (
            drives.map(drive => <DriveBar key={drive.path} drive={drive} />)
          )}
        </div>

        <div className="p-3 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Directories</p>
          <button
            onClick={handleAddDir}
            className="w-full text-xs text-brand border border-brand/30 hover:bg-brand/10 rounded px-2 py-1.5 transition-colors mb-3 text-left"
          >
            + Add Directory
          </button>

          {watchedDirs.length === 0 ? (
            <p className="text-xs text-white/20">No directories added</p>
          ) : (
            <div className="flex flex-col gap-2">
              {watchedDirs.map(dir => {
                const fileCount = scannedFiles.get(dir)?.length ?? 0
                const isScanning = scanning.has(dir)
                return (
                  <div key={dir} className="group rounded bg-white/5 p-2">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[11px] text-white/70 font-mono break-all leading-tight flex-1 min-w-0 truncate" title={dir}>
                        {dir}
                      </span>
                      <button
                        onClick={() => handleRemoveDir(dir)}
                        className="text-white/30 hover:text-red-400 transition-colors text-xs flex-shrink-0 ml-1"
                        title="Remove directory"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-white/30">
                        {isScanning ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-block w-2.5 h-2.5 border border-brand border-t-transparent rounded-full animate-spin" />
                            Scanning…
                          </span>
                        ) : (
                          `${fileCount} files`
                        )}
                      </span>
                      <button
                        onClick={() => handleMoveDir(dir)}
                        className="text-[10px] text-white/30 hover:text-brand transition-colors"
                        title="Move directory"
                      >
                        Move
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand/50"
          />
          <div className="flex items-center rounded overflow-hidden border border-white/10">
            {(['all', 'image', 'video'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-3 py-1.5 text-xs capitalize transition-colors ${
                  filter === type
                    ? 'bg-brand text-white'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {type === 'all' ? 'All' : type === 'image' ? 'Images' : 'Videos'}
              </button>
            ))}
          </div>
        </div>

        {/* Grid or empty state */}
        {watchedDirs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-4 opacity-30">📁</p>
              <p className="text-white/30 text-sm mb-4">No directories added yet</p>
              <button
                onClick={handleAddDir}
                className="text-sm text-brand border border-brand/30 hover:bg-brand/10 rounded px-4 py-2 transition-colors"
              >
                + Add Directory
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-white/25 text-sm">
              {search || filter !== 'all' ? 'No files match your search' : 'No media files found in watched directories'}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(file => (
                <StorageTile key={file.filePath} file={file} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
