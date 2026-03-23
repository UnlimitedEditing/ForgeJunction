# Forge Junction — Release Checklist

> Run through this before every release tag. Each item should pass cleanly on a
> cold start (fresh app data, no persisted state) **and** on a warm start
> (existing renders, projects, tags in localStorage).
>
> Dev setup required for editor tests: `npm run dev:editor` in a second terminal.

---

## 1 — Authentication

- [ ] Cold start shows Onboarding screen (no key stored)
- [ ] Entering a valid API key passes validation and lands on the main layout
- [ ] Entering an invalid key shows the correct error message
- [ ] Closing and reopening the app re-authenticates automatically (key persisted)
- [ ] Settings → API key field shows the stored key and accepts an update
- [ ] Removing the key via Settings returns to Onboarding

---

## 2 — Workflow & Concept loading

- [ ] Workflow list appears in the left sidebar on first load
- [ ] Opening the gallery popup (bottom bar) shows workflow cards with thumbnails
- [ ] Hovering a workflow card shows its description overlay
- [ ] Clicking a workflow that supports LoRAs enters the concept browser
- [ ] Concept browser loads and shows filterable model family tabs
- [ ] Selecting a concept appends `<token:weight>` to the prompt
- [ ] Dragging a workflow card onto the canvas creates a PromptNode pre-filled with that workflow
- [ ] Dragging a concept onto an existing PromptNode appends the token

---

## 3 — Render queue

- [ ] Submitting a prompt with a selected workflow enqueues a render
- [ ] Status bar shows queue count and active render indicator
- [ ] SSE stream progresses: queued → active → streaming → done
- [ ] Progress bar animates based on ETA
- [ ] Completed render appears as a tile in the Media Library
- [ ] Batch render (`/images:6`) expands into 6 individual tiles, each with a `1/6` badge
- [ ] Cancel button aborts the active render and marks it as error
- [ ] Cancel All clears the whole queue
- [ ] Errored render shows the error message in Output History
- [ ] WebSocket fallback: if SSE closes before `rendering_done`, the WS delivers the result (test by observing the "SSE closed — awaiting WebSocket" log entry)
- [ ] Late-result recovery poller starts after an unresolved error with a `renderHash`
- [ ] Up to 5 renders run concurrently (submit 6, watch that only 5 start)

---

## 4 — Media Library

- [ ] All completed renders show as tiles, one tile per image (batches expanded)
- [ ] Column count slider (2–5) resizes the grid live
- [ ] Search box filters tiles by prompt text
- [ ] Clicking a tile opens the lightbox / full-screen viewer
- [ ] 🔞 hover button tags a render as NSFW
- [ ] `hideNsfw: true` (Settings default) hides NSFW tiles entirely
- [ ] `hideNsfw: false` shows NSFW tiles with blur-on-hover
- [ ] NSFW state persists across restarts
- [ ] Output History (right panel) collapsed card shows stacked thumbnails for batches
- [ ] Expanded card shows `‹ Prev` / `Next ›` for browsing within a batch

---

## 5 — Projects

- [ ] Creating a project assigns a name and persists it
- [ ] Setting a project as active shows its name in the top bar and Output History
- [ ] Completing a render while a project is active adds it to the project's render list
- [ ] Active project filters the FJ Media Bin in the video editor to project renders only
- [ ] Deactivating a project (✕ button) returns to global render view
- [ ] Projects with `dimensions` inject `/size:WxH` into prompt submissions automatically

---

## 6 — Canvas

- [ ] Canvas opens from the ⬡ button; panning and zooming work
- [ ] Right-click radial menu appears with node creation options
- [ ] Creating a PromptNode from the radial menu places it on canvas
- [ ] Typing a prompt in the PromptNode and submitting sends a render
- [ ] Completed render result appears as a MediaNode connected by a wire
- [ ] Wires can be dragged from PromptNode output to connect to a BinNode or MediaNode
- [ ] Deleting a node removes it and its connected wires
- [ ] MethodBrowserNode opens from the toolbar; opening it a second time closes the first (singleton)
- [ ] Dragging a workflow from the gallery popup onto the canvas creates a pre-wired PromptNode
- [ ] Canvas state persists across app restarts
- [ ] Source image drag-and-drop (image/video/audio file) creates a MediaNode

---

## 7 — Chain Builder

- [ ] Chain Builder opens from the ⛓ button
- [ ] Selecting a node in the chain syncs its prompt and workflow into the Prompt Editor
- [ ] Editing the prompt in the Prompt Editor syncs back to the selected chain node
- [ ] Chain template pane is accessible from the ◫ toggle

---

## 8 — Skills

- [ ] Skills panel loads the skills list from the API
- [ ] Invoking a skill with a prompt returns a generated workflow command
- [ ] Skill render submits successfully and produces a result

---

## 9 — Video editor — basic operation

> Requires `npm run dev:editor` running in a second terminal.

- [ ] Clicking ✂ opens the video editor layout
- [ ] Omniclip iframe loads (not a black screen, not a directory listing)
- [ ] Loading indicator on the ✂ button is visible briefly then disappears when the bridge fires
- [ ] FJ Media Bin sidebar is visible to the left of the iframe
- [ ] Completed renders appear as items in the Media Bin
- [ ] Searching the Media Bin filters items by prompt / filename
- [ ] Clicking "Home" (⌂) returns to the main layout without unloading the editor

---

## 10 — Video editor — bridge protocol

- [ ] `fj:bridge-ready` fires after Omniclip boots (confirmed by Media Bin populating)
- [ ] `fj:sync-library`: new render completing while editor is open adds it to the Media Bin without a page reload
- [ ] `fj:add-asset` (+  button): clicking + on a Media Bin item places it on the Omniclip timeline
- [ ] Drag from Media Bin into the Omniclip timeline places the asset at the drop position
- [ ] `fj:sync-tags`: tags created in Settings/tags appear in the Omniclip Project panel dropdown

---

## 11 — Video editor — Project panel (markers + tag→markers)

- [ ] "Project" panel is accessible from Omniclip's panel switcher
- [ ] Timeline markers can be placed with `M` keyboard shortcut
- [ ] Amber diamond marker appears on the time ruler; dashed vertical line extends down
- [ ] `Ctrl+M` / `Shift+M` navigate to next / previous marker
- [ ] Clicking a diamond on the ruler removes that marker
- [ ] "Clear all" button removes all markers
- [ ] Tag → Markers: selecting a tag from the dropdown and clicking "Import to Markers" creates markers at the correct timestamps
- [ ] Warning shown when no markers exist before import

---

## 12 — Video editor — export

- [ ] Timeline contains at least one video or image clip
- [ ] Export dialog opens from Omniclip's export button
- [ ] FFmpeg.wasm initialises (requires cross-origin isolation via `coi-serviceworker.js`)
- [ ] Export completes and prompts a file download
- [ ] Exported file plays correctly in an external media player

---

## 13 — Storage & utilities

- [ ] Storage Manager shows disk usage and render counts
- [ ] Debug Report (Ctrl+Shift+E) generates and downloads a log file
- [ ] Theme switching (File → Theme) changes the UI colour scheme and persists on restart
- [ ] Window resize down to minimum (1024×600) doesn't break layout

---

## Known dev-mode non-issues

These appear in dev and are **expected** — do not file bugs for them:

| Message | Why it's safe |
|---|---|
| `Electron Security Warning (Disabled webSecurity)` | `webSecurity: false` is required for Graydient API calls (no CORS headers). Warning is suppressed in packaged builds. |
| `Electron Security Warning (allowRunningInsecureContent)` | Side-effect of the above. Also suppressed on package. |
| `Request Autofill.enable failed` | Chromium DevTools noise from the Omniclip window. Harmless. |
| `coi-serviceworker` reload on first editor open | Expected — the service worker registers then triggers one transparent reload to activate cross-origin isolation. |
