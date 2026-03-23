# Forge Junction — Collaboration Roadmap

> Build this after the video editor is stable and core canvas functionality
> is fleshed out. The phases are designed to be independently shippable and
> testable — each one works on its own before the next begins.

---

## Privacy model (read this first)

The collaboration space is **opt-in at the asset level**.

- A user's **media library** is always private — other participants never see it
- A user's **chain builder / prompt history** is always private
- A user's **render queue** is always private
- Assets enter the shared space **only when the user explicitly places a node
  on the shared canvas** — dragging a MediaNode from their private bin onto the
  canvas is the act of sharing
- The shared canvas is the only shared surface; everything behind it stays local

This mirrors the mental model of a shared whiteboard: you choose what to put on
the board. Your desk is yours.

---

## Phase C1 — Canvas collaboration (structural state only)

**Goal:** Multiple users can join a shared canvas session and see each other's
nodes, edges, and prompt content in real time. No cursors yet. No voice.

### What is shared

| State | Broadcast? | Notes |
|---|---|---|
| Node added | ✅ | Full node payload |
| Node moved | ✅ | Debounced — send on drag-end, not every pixel |
| Node deleted | ✅ | By node ID |
| Edge connected | ✅ | Full edge payload |
| Edge deleted | ✅ | By edge ID |
| Prompt text updated | ✅ | Debounced — send on blur or 500ms idle |
| MediaNode result URL | ✅ | Only after user explicitly places the node |
| Viewport (pan/zoom) | ❌ | Each user navigates independently |
| Render queue | ❌ | Renders are private — results appear when placed |
| Media library | ❌ | Always private |
| Chain builder state | ❌ | Always private |

### Implementation

**New file: `src/stores/collabStore.ts`**
- Zustand store (no persist) that owns the Sparrow RTC room
- `host()` → generates invite code, returns `{ invite, disconnect }`
- `join(invite)` → connects to host, receives snapshot, returns `{ disconnect }`
- `broadcastAction(type, payload)` — sends JSON over reliable data channel
- `onAction(handler)` — registers incoming action handler
- `peers: Peer[]` — connected peers (id, joined_at)
- `isHost: boolean`, `isConnected: boolean`, `invite: string | null`

**Wrap `canvasStore` mutations:**
Apply a thin broadcast wrapper to the actions that touch shared state. On each
structural mutation (add node, move node, delete, connect, disconnect):
1. Apply locally as normal
2. If `collabStore.isConnected`, call `collabStore.broadcastAction(type, payload)`

Incoming actions from peers are applied with an `{omit: true}` flag that skips
re-broadcasting (prevents loops — identical to Omniclip's pattern).

**On peer join (host side):**
Host serialises the current shared canvas snapshot (nodes + edges, minus any
private state) and sends it over the reliable channel as `{type: "init",
snapshot}`.

**Session UI — `src/components/CollabBar.tsx`**
- Shown in the canvas toolbar when the video editor is closed
- "Start session" button → host, copies invite code to clipboard
- "Join session" input + button → client join
- When active: participant count badge, "End / Leave" button
- Keep it minimal — this is not the main event, it's a utility bar

**Done when:** Two browser windows / two machines can open the same canvas
session via invite code and see node/edge changes propagate in real time.

---

## Phase C2 — Cursor presence

**Goal:** Each participant's canvas cursor is visible to others as a coloured
dot with their name. Viewport-independent (you see where they are in canvas
space, not screen space).

### What is added

- Cursor position (canvas coordinates, not screen) broadcast at ~20fps while
  the user is active on the canvas
- Sent over an **unreliable** data channel (UDP-like) — dropped packets are
  fine, stale positions are worse than gaps
- Each peer assigned a colour from a fixed palette on join (same palette
  Omniclip uses for collaborators)
- Cursor fades out after 3s of no movement, disappears after 10s

### Implementation

**Add to `collabStore`:**
- `cursors: Record<peerId, {x: number, y: number, name: string, color: string, lastSeen: number}>`
- Broadcast `{type: "cursor", x, y}` from a `pointermove` handler on the canvas
  (throttled to 50ms)
- Convert screen → canvas coordinates using the viewport transform before
  broadcasting, so all peers share the same coordinate space
- On receive: update `cursors[peerId]`, schedule a cleanup timeout

**Render cursors in `InfiniteCanvas.tsx`:**
- Overlay `<div>` elements positioned absolutely in canvas space using the same
  transform as nodes
- Each cursor: small coloured circle + peer name label below it
- CSS transition on position (100ms ease) to smooth out the 20fps updates

**Done when:** Moving your mouse on the canvas is visible to other participants
as a smooth cursor in the correct position.

---

## Phase C3 — Voice

**Goal:** Participants in a session can speak to each other. Push-to-talk or
open mic, user's choice. No external service required — audio travels over the
same WebRTC peer connections already established by Sparrow.

### How it works

Sparrow gives us a `RTCPeerConnection` per peer. We add an audio track to that
connection without a new signalling round-trip:

```
getUserMedia({audio: true, video: false})
  → MediaStream
  → RTCPeerConnection.addTrack(track, stream)   // to each peer
  → peer.ontrack = (e) => new Audio(e.streams[0]).play()
```

The data channel signals mute/unmute state so the UI stays in sync.

### Implementation

**Add to `collabStore`:**
- `voiceEnabled: boolean` — whether the user has granted mic permission
- `muted: boolean` — local mute state
- `speakingPeers: Set<peerId>` — who is currently producing audio (via
  Web Audio `AnalyserNode` volume threshold)
- `enableVoice()` — calls `getUserMedia`, adds tracks to all peer connections
- `disableMicrophone() / unmuteMicrophone()` — track.enabled toggle
- Broadcast `{type: "voice-state", muted: boolean}` on toggle so others
  can show the correct UI

**Audio handling:**
- Use a `Web Audio AnalyserNode` on the local track to detect when the user
  is speaking — broadcast `{type: "speaking", active: boolean}` events to
  drive speaking indicators in the cursor/participant list
- Echo cancellation and noise suppression via `getUserMedia` constraints
  (`echoCancellation: true, noiseSuppression: true, autoGainControl: true`)

**UI additions to `CollabBar.tsx`:**
- Mic button (🎤) — click to enable voice, shows permission prompt
- Mute toggle once enabled
- Speaking indicator rings on participant cursors when they are active

**Done when:** Participants in a session can speak to each other with working
mute controls and speaking indicators on cursors.

---

## Phase C4 — Sage voice integration

**Goal:** While in a session, any participant can invoke Sage by voice and
the response is visible to everyone in the session (shared Sage context).

### How it works

Voice input is transcribed locally then broadcast to the session as a Sage
prompt. Sage's response is broadcast back to all participants so everyone sees
the same exchange. This makes Sage feel like a shared meeting participant rather
than a private assistant.

### Transcription options (choose one)

| Option | Latency | Quality | Cost |
|---|---|---|---|
| Web Speech API (`SpeechRecognition`) | ~0ms | Good, browser-dependent | Free |
| Whisper via Electron main process | ~500ms | Excellent | Free (local) |

Recommend Web Speech API first (faster to ship), Whisper upgrade later.

### Implementation

**Invocation:**
- Hold-to-talk button in `CollabBar` OR a configurable keyword ("Hey Sage")
  detected via `SpeechRecognition.continuous`
- Transcribed text is shown in a small overlay before being submitted
- User can cancel within 2s (ESC or release before threshold)

**Broadcast model:**
- Invoking peer broadcasts `{type: "sage-prompt", text, peerId, peerName}`
- All peers (including invoker) display the prompt in a shared Sage panel
  that slides in from the side of the canvas
- The **host** (or invoking peer — TBD) submits to the Sage API and streams
  the response tokens back via the data channel as `{type: "sage-token", text}`
- On completion, the full exchange is added to a shared session log

**Shared Sage panel:**
- Appears as a side-drawer on the canvas (not modal — doesn't interrupt work)
- Shows the running exchange log for the session
- Each entry shows who invoked, the prompt, and Sage's response
- Persists for the session duration, cleared on disconnect

**Privacy note:** Sage prompts entered via text input remain private (only
voice-invoked prompts are shared). Add a "share this response" button on
private Sage queries for users who want to broadcast a specific exchange.

**Done when:** A participant says "Hey Sage, what workflows should we use for
this project?" and all participants see the prompt and streaming response in the
shared panel.

---

## Phase C5 — Canvas + video editor unified session

**Goal:** When a session is active and the video editor is open, the editor
session is linked to the canvas session. Structural timeline changes (effects
added, markers set) propagate to all participants who have the editor open.
Assets remain private until explicitly shared (see privacy model above).

### Architecture — FJ as relay hub

Omniclip's internal Sparrow session is replaced (or suspended) when a FJ
session is active. FJ's `collabStore` becomes the single room authority.

```
Peer A (FJ canvas + editor)
  ↕ postMessage
  Omniclip iframe A
        ↕ WebRTC data channel (FJ collabStore)
  Omniclip iframe B
  ↕ postMessage
Peer B (FJ canvas + editor)
```

**New message types in the FJ ↔ Omniclip bridge:**
- `fj:collab-action` (FJ → iframe) — incoming editor action from a remote peer
- `fj:collab-broadcast` (iframe → FJ) — outgoing editor action to relay to peers

**Flow for a timeline edit:**
1. Peer A adds a video effect in Omniclip
2. Omniclip broadcasts via its internal collaboration system
3. `VideoEditor.tsx` intercepts the outgoing `postMessage` and routes it to
   `collabStore.broadcastAction("editor:action", payload)`
4. All connected peers receive the action via their `collabStore`
5. Each peer's `VideoEditor.tsx` receives it and forwards into their Omniclip
   iframe via `postMessage({type: "fj:collab-action", ...})`
6. Each Omniclip applies it with `{omit: true}`

**Omniclip internal collaboration is disabled** when FJ session is active — the
`fj-bridge.ts` suppresses the internal host/join UI and intercepts broadcasts.

### What is shared in the editor session

| Editor state | Shared? | Notes |
|---|---|---|
| Timeline effects (add/move/trim) | ✅ | All participants edit the same timeline |
| Markers | ✅ | Shared — that's the point of the tag→marker feature |
| Media files | ❌ | Private until placed on timeline from shared canvas node |
| Project settings (resolution, FPS) | ✅ | Set by host, propagated on join |
| Export | Host only | Only host can trigger export |

### Asset privacy in the editor

A media file only enters the shared editor session when:
1. The user has placed a `MediaNode` on the **shared canvas** (C1 opt-in), AND
2. The user drags that node into the **FJ Media Bin** in the editor sidebar

Step 2 is the second explicit consent gate. The bin sync (`fj:sync-library`)
only sends assets that meet both conditions. Assets sitting in the user's
private media library or on their private canvas nodes never leave their machine.

**Done when:** Two participants with the editor open see each other's timeline
edits in real time, while their private media libraries and canvas chains remain
invisible to each other.

---

## Dependency tree

```
C1 (canvas structural collab)
 └─ C2 (cursor presence)          ← can ship with C1 or immediately after
     └─ C3 (voice)
         └─ C4 (Sage voice)       ← requires C3 + existing Sage text feature
C1 (canvas structural collab)
 └─ C5 (canvas + editor unified)  ← independent of C2/C3/C4, requires C1
```

C2, C3, C4 are a vertical stack (each requires the previous).
C5 requires only C1 and can be developed in parallel with C2–C4.

---

## What to build first after editor stability

1. Finish and bug-test the video editor (Omniclip integration)
2. Flesh out core InfiniteCanvas features (wires, bins, rendering improvements)
3. **Then start C1** — everything else depends on it

---

## Checklist

- [ ] C1 — Canvas structural collaboration (nodes, edges, prompts)
- [ ] C2 — Cursor presence (canvas-space positions, colour-coded)
- [ ] C3 — Voice (WebRTC audio tracks, mute/speaking indicators)
- [ ] C4 — Sage voice integration (shared Sage panel, transcription)
- [ ] C5 — Canvas + editor unified session (relay architecture, asset privacy gates)
