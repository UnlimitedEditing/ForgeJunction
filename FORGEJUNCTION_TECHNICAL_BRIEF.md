# ForgeJunction — Technical Brief
> Context document for Claude Code. Read this before interpreting any feature requests, UI changes, or architectural decisions.

---

## What This Is

ForgeJunction is a **creative AI render orchestration platform**. Its core purpose is to let users compose, submit, and manage AI media generation jobs (image, video, audio) across one or more SaaS AI inference APIs — without needing to understand the raw text-based parameter syntax those APIs require.

The primary user is a **visual creative**: a designer, filmmaker, or artist who thinks in terms of media and workflow rather than command flags. The secondary user is a technically inclined power user who wants fine control without leaving the creative context.

The platform is **not** a prompt editor. It is a **render workspace** — closer in spirit to a DAW or NLE than to a chat interface.

---

## The Interface Model

### Infinite Canvas — Everything Is a Node

The UI is a single **infinite zoomable canvas**. There are no panels, tabs, workspaces, or separate windows. Every functional unit — a prompt, a media library, a render queue, a video editor, a catch aggregator, a notes pad — is a **spawnable, resizable, freely positionable node** on this canvas.

This replaces what was previously four separate application views:
- A multi-panel render workspace (left: workflows/loras, center: media library + prompt bar, right: output history)
- A project management browser
- An NLE video editor
- A node graph for planning render chains

All of these are now node types on the same canvas. The user composes their own workspace layout by spawning what they need, sizing it as they need it, and connecting nodes together.

**Design intent:** the canvas should feel like a rendering blackboard — minimal chrome, maximum creative space. Every UI element that is not directly serving the user's current creative action should be invisible or dormant.

### Node Types

| Node | Icon | Accent | Purpose |
|------|------|--------|---------|
| Prompt | ✦ | `#f0a030` (amber) | Text input + parameter controls for a render job |
| Media Bin | ⬡ | `#00c9a7` (teal) | Stores and sorts rendered output media |
| Render Queue | ◈ | `#9b72f5` (violet) | Live job submission history, timings, status |
| Video Editor | ▷ | `#e8445a` (red) | Inline NLE timeline for clip arrangement |
| Notes | ✐ | `#5ba3d9` (blue) | Freeform annotation, reference, doodle space |
| Catch Node | ⬦ | `#f5c842` (yellow) | Collects outputs from multiple upstream nodes, applies merge logic |

Each node has **left and right port dots** for connection wiring. Connections render as animated dashed bezier curves coloured by the source node's accent.

### Prompt Node — Key Behaviour

The Prompt node is the primary interaction surface. It has two layers:

1. **Raw text area** — the user's natural language description only. No parameter syntax visible here.
2. **Expandable parameter strip** — sliders and dropdowns for model, steps, CFG scale, aspect ratio, seed. These map to API-specific `--parameter value` syntax under the hood but are never shown as raw strings to the user unless they explicitly request raw mode.

The purpose of this separation is to make the SaaS APIs approachable for visual creatives who would be alienated by raw prompt syntax like `--ar 16:9 --v 6 --style raw`.

### Catch Node — Key Behaviour

The Catch node is a flow aggregator. It accepts connections from multiple upstream nodes (typically Prompt or Queue nodes) and applies configurable logic to determine what passes through: `merge` (combine all), `first` (first to arrive wins), `latest` (most recent overwrites), `vote` (majority of connected sources). This enables planned render chains without needing to manually sequence jobs.

---

## Interaction Design

### Desktop

- **Double-click** canvas → spawn menu (node picker)
- **Right-click** node → context menu (node-specific actions)
- **Drag** node header → reposition
- **Drag** resize handle (bottom-right) → resize
- **Scroll wheel** → zoom canvas
- **Alt + drag** or **middle-click drag** → pan canvas
- **Keyboard modifiers** (Ctrl, Shift, Alt) → modify context menu actions (highlighted in menu)

### Mobile (Touch) — Modifier Stack

Mobile devices lack keyboard modifier keys. These are replaced by a **3-button modifier stack** fixed to the bottom-left corner:

```
[ ⌃ ctrl  ]   ← bottom
[ ⇧ shift ]
[ ⌥ alt   ]   ← top
```

Behaviour:
- **Tap** a button → toggles that modifier on (glows in its accent colour). A toast appears centre-bottom confirming active modifiers.
- **Touch-drag** across multiple buttons in one gesture → activates a combination (e.g. drag from ctrl through shift = Ctrl+Shift combo active).
- Active modifiers persist until the user taps an action or taps empty canvas (auto-clears).
- When a context menu is open with modifiers active, modifier-gated actions highlight and ungated actions dim — the menu visually communicates what the modifier combo will do.

**Flick-right gesture** = right-click / context menu:
- Touch-start on any node, slide right ≥52px, stay roughly horizontal (dy < 44px), lift within 400ms → context menu appears at lift point.

**Pinch-to-zoom** on canvas → scale viewport.

**Double-tap** canvas → spawn menu (same as desktop double-click).

This touch interaction model is **intentional and pre-baked from the start** so that the same React components work on desktop and mobile without modification.

---

## Tech Stack

### Current (Desktop — Electron)

| Layer | Technology |
|-------|-----------|
| Runtime | Electron |
| UI Framework | React |
| Styling | Tailwind CSS |
| Video Processing | FFmpeg (via child process / node binding) |
| Library/Backend | Node.js (file management, metadata, API orchestration) |
| Fonts | Syne (display), JetBrains Mono (monospace), Instrument Sans (body) |

### Design Tokens

```
Background:       #060610  (near-black, slightly blue)
Surface:          rgba(10,10,20,0.88) with backdrop-filter blur
Grid dots:        rgba(255,255,255,0.07)
Border default:   rgba(255,255,255,0.08)
Border selected:  node accent colour
Text primary:     #e8e4dc
Text secondary:   rgba(255,255,255,0.5–0.75)
Text muted:       rgba(255,255,255,0.25–0.35)
```

Accent colours are per-node-type (see Node Types table above). They are used consistently for: port dots, selected borders, glow shadows, active state fills, connection line colours, and modifier button highlights.

---

## Development Pipeline

### Phase 1 — Desktop Feature Stabilisation (Current)
Build and iterate entirely within Electron. Full OS access, no sandbox constraints. Goal: every intended core function working correctly and stably.

Key areas still being developed:
- Node connection wiring (port-to-port drag to create connections)
- Persistent canvas state (save/load workspace layouts)
- Real API integration (replacing mock data in Queue and Media nodes)
- Sketch/draw mode on Notes node
- Command palette (`/` or `⌘K`) as alternative spawn method
- Multi-user presence and collaboration layer

### Phase 2 — Backend Extraction
Once feature-stable, lift the Node.js backend out of the Electron context into a hosted service (Express or equivalent). The Electron app is refactored to call this service over HTTP rather than via IPC/local calls. Electron continues to work, now pointing at `localhost` in dev and a remote host in production.

**Critical architectural constraint to enforce now:** all backend interactions from UI components must go through an abstracted service layer — never directly touching Electron IPC or filesystem APIs from React components. This makes Phase 2 a transport swap, not a rewrite.

FFmpeg stays server-side permanently. Video operations are invoked via API call, never client-side.

### Phase 3 — Web Client
With the backend hosted, the React UI is deployed as a standard web application calling the same API. Because mobile interaction was designed in from the start (modifier stack, touch gestures, pinch zoom), the web client is immediately mobile-capable without further UI work.

No native mobile app is planned. The web client is the mobile solution.

---

## Collaboration Model (Planned)

Each user has their own API credentials for the AI inference SaaS. On a shared canvas:
- Each user's render submissions are attributed by a **user colour dot** (amber, teal, violet — expandable).
- Nodes can optionally **glow in the submitting user's colour** during active renders.
- The Catch node aggregates outputs across users — enabling collaborative render pipelines where multiple people contribute generations to a shared collection.
- Canvas state is eventually shared and synchronised (real-time collaboration is a later-phase feature).

---

## What ForgeJunction Is Not (Right Now)

These are **not current priorities** but are explicitly on the long-term roadmap and must not be architected against:

- Not currently implementing P2P communication (VoIP, chat, presence sync) — but the system must leave clean extension points for these
- Not currently opening canvases to multi-user join — but the data model should assume shared ownership from the start
- Not a model fine-tuning or training platform

The following are **active features** and must be preserved:

- **File manager** — the Media Bin node and library layer constitute a genuine file management system. Browsing, sorting, filtering, metadata, and organising rendered output is core functionality, not incidental.
- **Collaborative spaces** — user attribution, shared canvas state, and multi-user render pipelines are planned and partially scaffolded. Do not remove or simplify these.

---

## Social & Communication Roadmap (Planned, Not Current)

ForgeJunction is intended to eventually support real human presence on the canvas — not as a social network, but as a **collaborative creative space**. Think shared sketchbook or creative studio, not Twitter.

Planned additions in rough priority order:

1. **Multi-user canvas** — multiple people on the same canvas, seeing each other's nodes and render activity in real time. User colour system (amber/teal/violet dots) is already scaffolded for this.
2. **VoIP** — voice-first communication. Preferred over text chat as the primary presence layer. No persistent chat stream cluttering the canvas. A minimal always-available call indicator is the only persistent UI addition this requires.
3. **Text chat** — lower priority than VoIP but wanted eventually. Likely implemented as a node type (a Chat node on the canvas) rather than a fixed sidebar, keeping with the everything-is-a-node philosophy.
4. **Open rooms** — publicly joinable canvas spaces. People can drop in, collaborate on renders, hang out, play canvas-native games, use the space socially. The canvas as a venue, not just a tool.

**Implementation constraint:** none of the above is being built until core render functionality is stable and smooth. The visual scaffolding (user dots, colour attribution, presence indicators) is fine to include as inert UI. Actual P2P transport, signalling, or room infrastructure is out of scope until Phase 3+.

---

## Notes for Claude Code

When receiving feature requests or bug reports in this codebase, assume:

1. The infinite canvas is the **primary** UI surface. Avoid suggesting fixed panels or separate routes as default solutions — but small persistent UI elements (e.g. a VoIP status indicator, a minimal toolbar) are acceptable when they serve a clear always-on function.
2. Node types are **extensible**. New node types follow the same pattern: icon, accent colour, header/content/port shell, inner content component. Chat, VoIP, and game nodes are valid future node types.
3. Mobile interaction is **first-class**. Any new interactive behaviour needs both mouse and touch handling.
4. The visual language is **intentionally minimal and dark**. Avoid adding decorative elements, additional colours outside the established accent set, or busy layouts.
5. The service layer abstraction between UI and backend is **non-negotiable** for Phase 2 portability.
6. The file management layer (Media Bin, library metadata, sort/filter) is **core functionality** — treat it with the same care as the render pipeline.
7. Social and communication features are **deferred but not excluded**. Do not make architectural decisions that would make VoIP, real-time presence, or open rooms harder to add later.
8. The JSX prototype (`forgejunction.jsx`) is a **UI reference implementation** — it demonstrates layout, interaction patterns, and visual design. The production Electron app replicates this structure with real data and real API calls substituted for the mock data in the prototype.
