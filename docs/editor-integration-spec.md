# FJ ↔ Video Editor Integration Spec
> Replacement editor linking protocol — derived from Tooscut audit

This document captures every API surface point between ForgeJunction and the
embedded video editor so that Tooscut can be replaced by any editor that
implements this contract.

---

## 1. Embedding Model

ForgeJunction hosts the editor in an **`<iframe>`** rendered inside
`src/components/TooscutEditor.tsx` (rename as appropriate).  The iframe URL is
resolved at runtime:
- **Dev**: `VITE_TOOSCUT_URL` env var or `http://localhost:4200`
- **Prod**: Electron IPC `tooscut:get-url` (preload exposes
  `window.electron.tooscut.getUrl(): Promise<string>`)

The editor app can be **any web app** (React, Vue, plain HTML) as long as it
implements the postMessage bridge below and exposes the two Zustand-equivalent
stores.

---

## 2. postMessage Protocol

All messages cross the iframe boundary.  Both sides use `postMessage(msg, '*')`.

### 2a. Parent → Editor (FJ sends, editor handles)

```ts
// Full library sync — sent on iframe load, bridge-ready, and when renders change.
// Editor must add any assets not already present (dedup by id).
{ type: 'fj:sync-library'; assets: FjAsset[] }

// Single asset addition — user clicked "+" in the FJ media bin.
{ type: 'fj:add-asset'; asset: FjAsset }

// Tag → Markers import — place N-th asset at N-th sorted timeline marker.
// Assets without a corresponding marker are still injected into the asset store.
{ type: 'fj:import-tag'; assets: FjAsset[]; tagName: string }

// Tag metadata sync — sent whenever FJ tags or bin items change.
// Editor uses this to populate the Project panel tag selector.
{ type: 'fj:sync-tags'; tags: FjTag[]; tagAssets: Record<string, FjAsset[]> }
```

### 2b. Editor → Parent (editor sends, FJ handles)

```ts
// Signals that the editor's bridge listener is mounted and ready to receive assets.
// FJ re-syncs the full library + tags on receipt.
{ type: 'fj:bridge-ready' }
```

### Shared Types

```ts
interface FjAsset {
  id: string;              // = ForgeJunction render ID (or `${renderId}-${batchIndex}`)
  url: string;             // CDN URL — always accessible, no auth needed
  name: string;
  type: 'video' | 'image' | 'audio';
  thumbnailUrl?: string | null;
  prompt?: string;         // FJ prompt text (display only)
}

interface FjTag {
  id: string;
  name: string;
  color: string;           // CSS hex color
}
```

---

## 3. Editor-Internal Store Contract

The editor must maintain two stores (can be the same object).  Names don't
matter — only the shape and the actions called by the bridge.

### 3a. Asset Store

```ts
interface AssetStore {
  /** All imported media assets. Bridge deduplicates by `id` before adding. */
  assets: MediaAsset[];

  addAsset(asset: MediaAsset): void;
  addAssets(assets: MediaAsset[]): void;   // optional optimisation
}

interface MediaAsset {
  id: string;
  type: 'video' | 'audio' | 'image';
  name: string;
  url: string;
  duration: number;        // seconds; 0 is acceptable for images
  size: number;            // bytes; 0 acceptable for CDN assets
  file: File;              // placeholder `new File([], name)` for CDN assets
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}
```

### 3b. Editor / Timeline Store

```ts
interface EditorStore {
  /** Sorted list of timeline markers. */
  markers: Marker[];

  addMarker(time: number, label?: string): void;
  removeMarker(id: string): void;
  clearMarkers(): void;

  /** Persist asset metadata for project save (separate from AssetStore blobs). */
  addAssets(assets: EditorAsset[]): void;

  /**
   * Place a clip on the timeline.
   * Must find or create a suitable track automatically.
   * Returns the new clip's id.
   */
  addClipToTrack(clip: NewClipInput): string;
}

interface Marker {
  id: string;
  time: number;      // seconds from timeline start
  label?: string;
}

interface EditorAsset {
  id: string;
  type: 'video' | 'audio' | 'image';
  name: string;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}

interface NewClipInput {
  type: 'video' | 'audio' | 'image';
  assetId: string;
  startTime: number;       // seconds
  duration: number;        // seconds
  speed: number;           // 1.0 = normal
  name?: string;
  assetDuration?: number;  // source material duration for trim range
}
```

---

## 4. Bridge Implementation (fj-bridge.ts)

File: `video-editor/apps/ui/src/fj-bridge.ts` (or equivalent in replacement)

The bridge must:
1. Listen for `message` events from `window.parent` only
2. On `fj:sync-library` — call `injectAsset` for each asset (parallel, dedup)
3. On `fj:add-asset` — call `injectAsset`
4. On `fj:import-tag` — await all `injectAsset` calls, then sort `store.markers`
   by time, iterate over assets, call `addClipToTrack` for each asset/marker pair
5. On `fj:sync-tags` — write to local tags store (for Project panel)
6. On mount — send `{ type: 'fj:bridge-ready' }` to `window.parent`

### `injectAsset` algorithm

```
1. Check AssetStore.assets for existing asset with same id → skip if found
2. Probe media metadata:
   - image → duration = 10s (fixed)
   - video → create <video>, listen onloadedmetadata, capture duration/width/height
   - audio → create <audio>, capture duration
   Timeout after 8s, fall back to duration = 0
3. Build MediaAsset from FjAsset + probed metadata
4. AssetStore.addAsset(asset)
5. EditorStore.addAssets([{ id, type, name, url, duration, width, height, thumbnailUrl }])
```

### `importTagToMarkers` algorithm

```
1. await Promise.all(assets.map(injectAsset))
2. const sorted = [...EditorStore.markers].sort((a,b) => a.time - b.time)
3. if sorted.length === 0 → return (assets injected but not placed)
4. for i in range(min(assets.length, sorted.length)):
     asset = AssetStore.assets.find(a => a.id === assets[i].id)
     if !asset → continue
     EditorStore.addClipToTrack({
       type: asset.type === 'video' ? 'video' : asset.type === 'audio' ? 'audio' : 'image',
       assetId: asset.id,
       startTime: sorted[i].time,
       duration: asset.duration > 0 ? asset.duration : 5,
       speed: 1,
       name: asset.name,
       assetDuration: asset.duration > 0 ? asset.duration : undefined,
     })
```

---

## 5. Local Tags Store (fj-tags-store.ts)

File: `video-editor/apps/ui/src/state/fj-tags-store.ts`

Simple in-memory (not persisted) Zustand store populated entirely from
`fj:sync-tags` messages.

```ts
interface FjTagsState {
  tags: FjTag[];
  /** tagId → ordered FjAsset[] (sorted by tag index, ready for import) */
  tagAssets: Record<string, FjAsset[]>;
  syncFromBridge(tags: FjTag[], tagAssets: Record<string, FjAsset[]>): void;
}
```

Used by the Project Properties panel to populate the tag selector dropdown and
pass the correct ordered asset list to `importTagToMarkers`.

---

## 6. Timeline UI Requirements

The editor's timeline must implement these UX behaviours for the FJ integration
to be useful.  These are not part of the message protocol but must exist in
whatever editor replaces Tooscut.

| Feature | Keyboard shortcut | Notes |
|---|---|---|
| Add marker at playhead | `M` | Appends `{ id, time: currentTime }` to marker list |
| Jump to next marker | `Ctrl+M` | Seeks playhead to nearest marker after currentTime |
| Jump to prev marker | `Shift+M` | Seeks playhead to nearest marker before currentTime |
| Remove marker | Click marker diamond | Visual indicator on ruler, clickable |
| Clear all markers | Button in Project panel | |

### Marker visual spec
- Rendered on the timeline ruler as an **amber (`#f59e0b`) diamond** shape
- A **dashed vertical line** (amber, 35% opacity) runs through all tracks at
  that time position
- Clicking the diamond removes the marker
- Markers are sorted by time in the store

---

## 7. Properties Panel Structure

The editor should expose a **Properties** panel (right sidebar) with two
top-level tabs:

### Media tab
Standard clip inspector — shown when a clip is selected on the timeline.
Contents depend on clip type (video/image → transform + effects; audio → volume;
text/shape → style, etc.).

### Project tab
Always visible regardless of selection.  Contains:

1. **Markers list** — numbered rows, `M:SS.d` time format, click-to-remove
   per row, "Clear all" button
2. **Tag → Markers Import** — tag selector dropdown (populated from
   `useFjTagsStore`), "Import to Markers" button (calls `importTagToMarkers`
   with the ordered asset list for the selected tag), warning hint when no
   markers exist

---

## 8. Drag-and-Drop from FJ Media Bin

The FJ media bin sets the following `dataTransfer` entries on `dragstart`:

```
application/x-asset-id              → asset.id (string)
application/x-asset-type-{type}     → '' (presence check, type = video|image|audio)
application/x-fj-asset              → JSON.stringify(FjAsset)
application/x-asset-duration-{n}    → '' (n = 0 for video/audio, 10 for images)
```

The editor's timeline drop handler should:
1. Read `application/x-asset-id` to look up the asset in AssetStore
2. If not found, read `application/x-fj-asset` and call `injectAsset` before placing
3. Place the clip at the drop position on the correct track

---

## 9. FJ-side Files (TooscutEditor.tsx wrapper)

These files live in the **ForgeJunction** repo (not the editor) and only need
renaming/rewiring when the editor changes:

| File | Purpose | What changes on editor swap |
|---|---|---|
| `src/components/TooscutEditor.tsx` | iframe host + FJ media bin sidebar | Update `DEV_URL`, rename component |
| `src/stores/tags.ts` | FJ tag system (per-tile, color, index order) | No change |
| `src/components/MediaLibraryGrid.tsx` | Tag assignment UI on tiles | No change |
| `electron/main.ts` | Spawns editor server, exposes IPC | Update server entry path |
| `electron/preload.ts` | `window.electron.tooscut.getUrl()` | Rename namespace if desired |

---

## 10. What the Replacement Editor Does NOT Need

- Any knowledge of FJ's Zustand stores, render queue, or project model
- Access to FJ's API key or Graydient endpoints
- Any Electron APIs — it runs as a plain web app in an iframe
- The Rust/WASM GPU compositor (that was Tooscut-specific) — a JS-based
  timeline with `<video>` playback is sufficient for the FJ use-case
- Server-side rendering — a pure Vite SPA is fine; Tooscut used TanStack Start
  (Nitro), any static build works as long as Electron can serve it

---

## Summary: Minimum Viable Replacement Checklist

- [ ] Implements `fj:bridge-ready` send on mount
- [ ] Handles `fj:sync-library`, `fj:add-asset` (dedup by id, probe metadata)
- [ ] Handles `fj:import-tag` (place clips at sorted markers)
- [ ] Handles `fj:sync-tags` (store in local fj-tags-store equivalent)
- [ ] Exposes `AssetStore.assets` array with `addAsset` action
- [ ] Exposes `EditorStore.markers` array with `addMarker / removeMarker / clearMarkers`
- [ ] Exposes `EditorStore.addAssets` (persistence layer)
- [ ] Exposes `EditorStore.addClipToTrack(NewClipInput): string`
- [ ] Timeline keyboard shortcuts: `M`, `Ctrl+M`, `Shift+M`
- [ ] Marker visuals: amber diamond on ruler, dashed vertical line, click-to-remove
- [ ] Properties panel: **Media** tab (clip inspector) + **Project** tab (markers + tag import)
- [ ] Drag-and-drop accepts `application/x-asset-id` and `application/x-fj-asset`
- [ ] Buildable as a static web app (Vite SPA or equivalent)
- [ ] Servable by a Node.js process spawned by Electron main (or any static file server)
