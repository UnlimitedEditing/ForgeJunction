# Forge Junction — Claude Context

## What this app is
Forge Junction is an Electron desktop application for AI media generation. Users write prompts, select workflows from the Graydient API, and receive generated images, videos, and audio. The core workspace is an infinite node canvas where prompt nodes connect to media nodes via wires, supporting concurrent batch rendering and chained workflows.

## Stack
- **Electron** (main + preload) + **React** + **Vite** via `electron-vite`
- **TypeScript** throughout
- **Tailwind CSS** for styling — dark palette: `surface` (#0f0f0f), `surface-raised` (#1a1a1a), brand: `brand` (#6c47ff)
- **Zustand** for all state management, most stores use `persist` middleware
- Build config: `electron.vite.config.ts` (must be dot, not hyphen)

## Dev commands
```
npm run dev      # Electron + Vite dev server (renderer at localhost:5173)
npm run build    # Production build
npm run package  # electron-builder → release/
```

## Project structure
```
electron/
  main.ts          # BrowserWindow, IPC handlers, preload path: ../preload/index.js
  preload.ts       # contextBridge → window.electron
  debugReporter.ts # System info collection for bug reports
src/
  main.tsx         # React root, initialises log collector
  App.tsx          # Root component, workspace routing
  api/
    graydient.ts   # ALL Graydient API calls — render submit, SSE streaming,
                   # fetchRenderInfo, resolveAllMedia, fetchWorkflows, fetchConcepts
  stores/
    canvasStore.ts    # Infinite canvas nodes, edges, viewport, render dispatch
    renderQueue.ts    # Concurrent render queue (max 5), SSE streaming, late-result recovery
    settings.ts       # User preferences — hideNsfw (persisted)
    sourceMedia.ts    # Active source image/video for img2img
    workflows.ts      # Workflow list cache
    render.ts         # Legacy single-render store (used by older UI paths)
    projects.ts       # Project management, notifyRenderComplete
    videoEditor.ts    # Video editor timeline clips
    prompt.ts         # Prompt text state
  components/
    canvas/
      InfiniteCanvas.tsx    # Main canvas — pan/zoom, drag, wire drawing, node drop
      PromptNode.tsx        # Prompt input node with input queue and render dispatch
      MediaNode.tsx         # Output media node (image/video/audio)
      BinNode.tsx           # Output bin — collects routed results
      MethodBrowserNode.tsx # Workflow/concept browser node (singleton — only one at a time)
      RadialMenu.tsx        # Right-click context menu on canvas
      MediaLightbox.tsx     # Full-screen media viewer
    MediaLibraryGrid.tsx    # Home page — all completed renders as tiles, one per image
    RenderViewer.tsx        # Right panel — output history, per-render expanded view
    WorkflowGalleryPopup.tsx # Bottom bar gallery — workflow + LoRA browser
    Settings.tsx            # Settings panel — API key + content preferences
    StatusBar.tsx           # Bottom HUD
    DebugReportDialog.tsx   # Bug report export dialog
```

## Key architectural decisions

### Render queue (`renderQueue.ts`)
- Up to 5 concurrent renders via `maxConcurrent`
- Each render streams SSE events: `render_queued` → `rendering_started` → `rendering_done`
- `QueuedRender.resultUrls` holds ALL images from a batch (e.g. `/images:6` → 6 entries). `resultUrl` is always just the first. **Always use `resultUrls` for display.**
- Late-result recovery: if a render errors but has a `renderHash`, a poller hits `fetchRenderInfo` every 30s for up to 20 minutes. This handles ghost renders that succeed on the backend after an apparent failure.
- `isNsfw: boolean` field on each render — toggled by user, persisted. `markNsfw(id, bool)` action.
- Store is persisted. On rehydrate, any active/streaming/queued renders are marked as error (they can't resume).

### Canvas wires (`InfiniteCanvas.tsx`)
- Wire dragging uses a `PendingEdge` state + a `pendingEdgeRef` that stays in sync.
- The `useEffect` for mousemove/mouseup listeners depends on `isDraggingEdge` (boolean), NOT on `pendingEdge` itself. This is critical — putting `pendingEdge` in deps caused constant listener teardown on every mousemove, breaking connections entirely.

### Batch renders in UI
- `MediaLibraryGrid` flattens `resultUrls` into individual `FlatTile` entries — each image gets its own grid tile with a `1/6` badge when part of a batch.
- `RenderViewer` collapsed card shows stacked thumbnail layers + count badge for batches. Expanded card has `‹ Prev` / `Next ›` arrows to browse images within a batch.

### NSFW system
- `useSettingsStore` (`fj-settings`) — `hideNsfw: boolean`, defaults `true`
- When `hideNsfw` is on: NSFW tiles are filtered out of the media library entirely, thumbnails are blurred in output history
- When `hideNsfw` is off: tiles show with blur-on-hover behaviour
- 🔞 button appears on every tile hover overlay and in the expanded render card

### MethodBrowserNode (canvas browser)
- Singleton — `addMethodNode` in `canvasStore` filters out any existing `utility` type nodes before adding the new one. Opening a second browser closes the first.

### Drag and drop (canvas)
- Custom MIME types: `application/fj-workflow`, `application/fj-concept`, `application/fj-media`
- Files dropped onto canvas: `image/`, `video/`, `audio/` all accepted
- Concepts dragged onto a prompt node append `<token:0.8>` to the prompt text

### API key
- Stored encrypted via Electron's `safeStorage` / keychain
- Accessed at runtime via `useAuthStore.getState().apiKey`
- All API calls in `graydient.ts` call `getApiKey()` inline — no prop drilling

### Build quirks
- No `"type": "module"` in package.json — Electron main needs CJS
- `electron.vite.config.ts` uses `fileURLToPath` to polyfill `__dirname`
- Main/preload output: `dist-electron/main/index.js`, `dist-electron/preload/index.js`
- Renderer output: `dist/`

## Video Editor Integration

> **STATUS (2026-03-23): Tooscut is being replaced by Omniclip.**
> Full migration plan: `docs/omniclip-integration-roadmap.md`
> Protocol spec (editor-agnostic): `docs/editor-integration-spec.md`

### Current state
- `video-editor/` — Tooscut NLE source (being phased out, do not extend)
- `alt-editor/omniclip-main/` — Omniclip NLE source (active replacement)
- Bridge files in Omniclip are complete; Electron wiring is Phase 2 of the roadmap

### Omniclip stack
- **Lit.js** web components via `@benev/slate` signals
- **PixiJS** 2D WebGL compositor + **GSAP** animations + **FFmpeg.wasm** export
- Build: `npm run build` inside `alt-editor/omniclip-main/` → output to `x/`
- Dev: `npm start` (turtle-standard-watch) + `npx serve x -p 3000`

### FJ ↔ Editor postMessage protocol
All communication crosses the iframe boundary via `postMessage`.

**FJ → editor:**
- `fj:sync-library { assets }` — full asset sync on load
- `fj:add-asset { asset }` — single asset from "+" button in media bin
- `fj:import-tag { assets, tagName }` — place N-th tagged clip at N-th marker
- `fj:sync-tags { tags, tagAssets }` — tag metadata for Project panel

**Editor → FJ:**
- `fj:bridge-ready` — editor mounted, triggers FJ re-sync

### Integration files (FJ side)
- `src/components/TooscutEditor.tsx` — iframe host + FJ media bin sidebar
  (rename to `VideoEditor.tsx` in Phase 3)
- `src/stores/tags.ts` — FJ tag system (per-tile, color, index ordering)
- `src/components/MediaLibraryGrid.tsx` — tag assignment UI on media tiles
- `electron/main.ts` — spawns editor server, handles `tooscut:get-url` IPC
- `electron/preload.ts` — exposes `window.electron.tooscut.getUrl()`

### Integration files (Omniclip side, in `alt-editor/omniclip-main/s/`)
- `context/fj-bridge.ts` — postMessage bridge (NEW, complete)
- `context/types.ts` — `FjMarker`, `FjTag`, `FjTagAsset` types added
- `context/actions.ts` — `add_marker`, `remove_marker`, `clear_markers`, `set_fj_tags`
- `context/controllers/shortcuts/controller.ts` — M / Ctrl+M / Shift+M shortcuts
- `components/omni-timeline/views/time-ruler/` — amber marker diamonds + dashed lines

### Roadmap phases
| Phase | Task | Status |
|---|---|---|
| 1 | Omniclip build smoke test | **complete** |
| 2 | Electron serves Omniclip (replace Tooscut server) | **next** |
| 3 | Rename FJ wrapper component to `VideoEditor` | pending |
| 4 | Omniclip Project panel (markers list + tag→markers UI) | pending |
| 5 | Delete `video-editor/` (Tooscut) | pending |
| 6 | Strip PostHog analytics from Omniclip | optional |
| 7 | Strip Sparrow RTC collaboration from Omniclip | optional |

## Things to test before beta
- Wire connections end-to-end after the `pendingEdgeRef` fix
- Batch renders (`/images:6`) — all tiles appear in media library, arrows work in output history
- Late-result recovery — a render that appears to fail but completes 10+ minutes later
- Audio file drops onto canvas — should create a MediaNode with `<audio>` player
- NSFW toggle — tagged renders disappear/blur correctly, persist across restarts
- MethodBrowserNode singleton — opening from toolbar twice should only show one node
- **[NEW]** Marker shortcuts (M / Ctrl+M / Shift+M) work in Omniclip timeline
- **[NEW]** Tag→markers import places clips at correct timeline positions
- **[NEW]** FJ media bin assets appear in Omniclip media library after sync
