# Omniclip Integration Roadmap
> Replacing Tooscut with Omniclip as the embedded video editor

---

## Status: Bridge files complete — ready for phased rollout

The bridge files are built and merged into the Omniclip source.  The remaining
work is organised into phases so each can be tested independently before the
next begins.

---

## What is already done

### Omniclip-side (in `alt-editor/omniclip-main/s/`)

| File | Change |
|---|---|
| `context/fj-bridge.ts` | **NEW** — Full postMessage bridge (sync-library, add-asset, import-tag, sync-tags, bridge-ready) |
| `context/types.ts` | Added `FjMarker`, `FjTag`, `FjTagAsset` types; extended `NonHistoricalState` with `markers[]`, `fj_tags[]`, `fj_tag_assets{}` |
| `context/state.ts` | Added `markers: []`, `fj_tags: []`, `fj_tag_assets: {}` initial values |
| `context/actions.ts` | Added `add_marker`, `remove_marker`, `clear_markers`, `set_fj_tags` to `non_historical` actions |
| `context/controllers/shortcuts/controller.ts` | Added `ActionType` values and `DEFAULT_SHORTCUTS` entries for `"Add marker"` (M), `"Next marker"` (Ctrl+M), `"Previous marker"` (Shift+M) |
| `components/omni-timeline/views/time-ruler/view.ts` | Renders amber diamond markers + dashed vertical lines; click diamond to remove |
| `components/omni-timeline/views/time-ruler/styles.ts` | Added `.fj-marker`, `.fj-marker-diamond`, `.fj-marker-line` CSS |
| `main.ts` | Calls `init_fj_bridge()` after `setupContext()` |

### FJ-side (in `src/` and `video-editor/`)

| File | Status |
|---|---|
| `src/stores/tags.ts` | Complete — tag CRUD, per-tile assignment, index ordering |
| `src/components/MediaLibraryGrid.tsx` | Complete — tag popover, color pills on tiles |
| `video-editor/apps/ui/src/state/fj-tags-store.ts` | Complete — Zustand store for synced tag data (Tooscut-era, reuse pattern) |
| `docs/editor-integration-spec.md` | Complete — full protocol spec for any future editor swap |

---

## Phase 1 — Omniclip build + smoke test ✅ COMPLETE

**Result:** `npm run build` exits 0. `x/main.bundle.js` generated (15.5s).
All bridge symbols confirmed in compiled output:
- `x/context/fj-bridge.js` — 7 occurrences of key bridge symbols
- `x/context/actions.js` — 4 marker/tag actions compiled
- `x/context/controllers/shortcuts/controller.js` — 6 marker shortcut references
- `x/components/omni-timeline/views/time-ruler/view.js` — 3 fj-marker references

**Fix applied:** Unix `cp` commands in `package.json` replaced with cross-platform
`node -e "fs.copyFileSync/cpSync"` equivalents so Windows builds work cleanly.

---

## Phase 2 — Electron integration (replace Tooscut server) ✅ COMPLETE

**Goal:** Serve Omniclip from Electron instead of Tooscut.

### 2a. Update `electron/main.ts`
- Change `startTooscutServer()` to point at `alt-editor/omniclip-main/x/` as a
  static file directory (use `express` or `electron`'s built-in `loadFile`)
- Alternatively: bundle Omniclip as a static SPA under `resources/omniclip/`
  and serve with a minimal Node http server (same pattern as the Tooscut Nitro
  server, just static files this time — no SSR required)
- Update `tooscutUrl` → `omniclipUrl`
- IPC channel `tooscut:get-url` → `editor:get-url` (or keep the name for
  backward compat and just change the pointed URL)

### 2b. Update `electron/preload.ts`
- Rename `window.electron.tooscut.getUrl` → `window.electron.editor.getUrl`
  (optional — only if renaming the IPC channel)

### 2c. Update `package.json`
- Replace `"build:tooscut"` script with `"build:omniclip"`:
  `cd alt-editor/omniclip-main && npm run build`
- Update `extraResources` to point at `alt-editor/omniclip-main/x/` instead of
  the Tooscut `.output/`
- Keep the `resources/tooscut/` → `resources/omniclip/` rename in sync

**Done when:** `npm run dev` opens Omniclip in the editor panel iframe.

---

## Phase 2.5 — Cross-origin isolation (required for SharedArrayBuffer / FFmpeg.wasm) ✅ COMPLETE

Omniclip requires `SharedArrayBuffer`, which browsers only expose when the
document is cross-origin isolated (`COOP: same-origin` + `COEP: require-corp`).

**Do NOT set these headers on the server.** Omniclip bundles `coi-serviceworker.js`
specifically for environments that can't set headers (GitHub Pages, local dev,
Electron static servers). It works like this:

1. First load — no COOP/COEP on the page, CDN resources (PixiJS, Shoelace) load normally.
   The service worker registers itself, then navigates (`location.reload()`).
2. Second load (SW active) — the SW intercepts the navigation response and injects
   COOP/COEP headers. It also adds `Cross-Origin-Resource-Policy: cross-origin` to
   CDN responses so they pass the COEP check.
3. `SharedArrayBuffer` is now available. FFmpeg.wasm and WebCodecs workers function correctly.

**If you set COEP on the server**, CDN scripts are blocked on the very first page
load before the service worker has a chance to register — producing a black screen.
That's why `electron/main.ts` → `startOmniclipServer()` does **not** send those headers.

For **dev**, run the Omniclip dev server without COEP flags:

```
npx serve x -p 3000
```

The service worker handles everything from there.

---

## Phase 3 — Rename FJ wrapper component ✅ COMPLETE

**Goal:** Replace `TooscutEditor.tsx` references with Omniclip-aware names,
update the iframe URL, remove any dead Tooscut-only code.

### Changes to `src/components/TooscutEditor.tsx` (rename → `VideoEditor.tsx`)
1. Change `DEV_URL` to `http://localhost:3000` (Omniclip's default dev port)
2. Rename component to `VideoEditor`
3. Update `window.electron.tooscut.getUrl` → `window.electron.editor.getUrl`
4. Update route in `src/App.tsx` where the component is rendered
5. Remove any references to `TooscutEditor` throughout the codebase

**Note:** The sidebar logic (FJ media bin, search, drag-drop, `syncLibrary`,
`syncTags`) is **identical** — no protocol changes needed.

**Done when:** The editor panel opens Omniclip and the FJ media bin sidebar is
visible alongside it.

---

## Phase 4 — Omniclip Project panel (markers + tag→markers UI) ✅ COMPLETE

**Goal:** Add the "Project" tab to Omniclip's Properties panel with the markers
list and tag→marker import UI, matching what was built for Tooscut.

### 4a. Create `s/components/omni-project/panel.ts`
New Omniclip shadow component that reads from `omnislate.context.state`:
- **Markers section** — list of markers with index, `M:SS.ms` time, click-to-
  remove per row, "Clear all" button; Ctrl+M / Shift+M hint
- **Tag → Markers import** — dropdown from `state.fj_tags` + `state.fj_tag_assets`,
  "Import to Markers" button that calls `import_tag_to_markers(tagAssets[tagId])`
  from `fj-bridge.ts`; warning when no markers exist

### 4b. Register the panel in `s/main.ts`
```ts
import {ProjectPanel} from "./components/omni-project/panel.js"
// Add to panels object in setupContext():
// ProjectPanel,
```

### 4c. Add to layout
Add `ProjectPanel` as a dockable panel in `@benev/construct` layout config
alongside `MediaPanel`, `TextPanel`, etc.

**Done when:** "Project" panel is accessible from the Omniclip panel switcher
and tag→marker import works end-to-end.

---

## Phase 5 — Remove Tooscut ✅ COMPLETE

**Goal:** Delete all Tooscut source files and references.

1. Delete `video-editor/` directory entirely
2. Delete `src/components/TooscutEditor.tsx` (replaced by `VideoEditor.tsx`)
3. Delete `video-editor/apps/ui/src/state/fj-tags-store.ts` (replaced by
   `state.fj_tags` in Omniclip's non-historical state)
4. Remove `"build:tooscut"` from `package.json`
5. Remove `extraResources` for Tooscut
6. Update `cleanup.py` if it has any Tooscut-specific exclusions
7. Remove `graydient-websockets-example.py` if unneeded (it was in git status
   as untracked)

**Done when:** `git status` shows no Tooscut references; app builds and runs
cleanly.

---

## Phase 6 — PostHog / analytics strip ✅ COMPLETE

Omniclip ships with PostHog analytics enabled in `main.ts`.  For the embedded
Electron use case you likely want to disable this.

```ts
// In s/main.ts, replace:
posthog.init('phc_...', {...})
// With a no-op or remove entirely
```

Also remove `posthog-js` from `package.json` dependencies if desired.

---

## Key technical notes for implementers

### Time units
Omniclip uses **milliseconds** everywhere.  The FJ bridge protocol (and the old
Tooscut bridge) use **seconds** for durations.  All conversions happen inside
`fj-bridge.ts` — nothing outside the bridge needs to change.

### `start_at_position` (pixel vs time)
Omniclip stores effect positions in **pixels at current zoom**, not absolute
time.  The bridge converts: `px = time_ms / Math.pow(2, -zoom)`.  This means
effects placed via the bridge will visually shift if the user changes zoom after
import — this is expected and how all effects behave in Omniclip.

### CDN asset injection
`inject_fj_asset` fetches the full CDN blob before hashing.  This is the
correct path — Omniclip's compositor needs a `File` object for playback via
`URL.createObjectURL`.  Duration is probed via `<video>`/`<audio>` element
_before_ the full fetch to avoid blocking effect placement on slow downloads.

### Media dedup
Omniclip uses `file_hash` (content hash via `quick_hash`) to dedup, not the
FJ asset ID.  `fjAssetToHash` in the bridge maintains the FJ-ID → hash mapping
so drag-drop and re-sync remain idempotent.

### Omniclip dev server
`npm start` in `alt-editor/omniclip-main` runs `turtle-standard-watch` which
rebuilds to `x/` on change.  For dev you also need a static file server on
port 3000 pointing at `x/`.  A simple `npx serve x -p 3000` works.

---

## Checklist summary

- [x] `fj-bridge.ts` written (Omniclip-side)
- [x] Marker state + actions added
- [x] Marker keyboard shortcuts (M / Ctrl+M / Shift+M)
- [x] Marker visuals on ruler (amber diamond + dashed line)
- [x] `init_fj_bridge()` called on editor boot
- [x] Phase 1 — Omniclip build smoke test
- [x] Phase 2 — Electron serves Omniclip
- [x] Phase 3 — Rename FJ wrapper component
- [x] Phase 4 — Project panel in Omniclip
- [x] Phase 5 — Delete Tooscut
- [x] Phase 2.5 — COOP/COEP headers confirmed in static server
- [x] Phase 6 — Strip PostHog
