# Forge Junction

**AI media studio powered by [Graydient.ai](https://graydient.ai)**

Generate images, video, and audio using Graydient's workflow engine. Forge Junction is a desktop app (Windows/macOS/Linux) built with Electron and React.

---

## Table of Contents

- [Getting Started (Testers)](#getting-started-testers)
- [Getting Your API Key](#getting-your-api-key)
- [Using the App](#using-the-app)
  - [Workflow Selector](#workflow-selector)
  - [Prompt Editor](#prompt-editor)
  - [Input Media](#input-media)
  - [Parameters](#parameters)
  - [Output Viewer](#output-viewer)
  - [Settings & API Key](#settings--api-key)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Building from Source](#building-from-source)

---

## Getting Started (Testers)

### Option A — Run the installer (recommended)

1. Download the latest `Forge Junction Setup x.x.x.exe` from the [Releases](../../releases) page
2. Run the installer and launch the app
3. The welcome screen will walk you through connecting your Graydient account

### Option B — Run from source (requires Node.js 18+)

1. Clone this repository
2. Double-click **`launch.bat`** (Windows) — it will install dependencies and start the app automatically
3. If prompted by Windows Defender, click **More info → Run anyway** (the script only runs `npm install` and `npm run dev`)

> **Don't have Node.js?**  Download it free from [nodejs.org](https://nodejs.org) (LTS version). Run `launch.bat` again after installing.

---

## Getting Your API Key

Forge Junction requires a Graydient API key. On first launch you'll see the welcome screen — here's how to get your key:

1. Open Telegram and message [@PirateDiffusion_bot](https://t.me/PirateDiffusion_bot)
2. Send the command `/api`
3. The bot will reply with a link to your API key
4. Copy the key and paste it into the welcome screen, then click **Connect**

Don't have an account yet? [Register at graydient.ai](https://graydient.ai)

Need help? Message [@UnlimitedEditing](https://t.me/UnlimitedEditing) on Telegram.

> **Security note:** Your API key is encrypted using your operating system's keychain (Windows Credential Manager on Windows, Keychain on macOS). It is stored in your user profile, not in the app folder. If someone copies the application to another computer the key cannot be read — it is just encrypted data tied to your account on your machine.

---

## Using the App

The interface has three columns:

```
┌──────────────────┬────────────────────────────┬──────────────────┐
│  Workflow        │  Prompt Editor             │  Output          │
│  Selector        │                            │  Viewer          │
│                  │  [Parameters]              │                  │
│  Filter by type  │  [Input Media]             │  Progress bar    │
│  Search          │  [Descriptive text]        │  Rendered result │
│  Pick workflow   │  [Negative prompt]         │  Download        │
│                  │  [Submit Render]           │  Queue status    │
└──────────────────┴────────────────────────────┴──────────────────┘
```

### Workflow Selector

The left column lists all workflows available on your Graydient account.

- **Category tabs** — filter by type (Image, Video, Audio, etc.)
- **Search box** — type any part of a workflow name to filter
- **Source media filter** — when you load an input image or video, the list automatically narrows to workflows that can accept that media type. Click **Show all** to remove the filter.
- Click any workflow to select it. The prompt editor will update its placeholder to guide you.

### Prompt Editor

The center column is where you compose and submit your render.

**Descriptive text** — describe what you want to generate. The placeholder text suggests a structure appropriate for the selected workflow type:
- Images: `[subject] [scene / environment] [style / mood]`
- Video: `[camera movement] [subject + action] [scene description] [style]`
- Audio/music: `[verse] lyrics [chorus] chorus [bridge] bridge`
- img2img / img2vid: describe the motion or changes to apply

**Negative prompt** — optionally describe what you want to avoid (blurry, ugly, watermark, etc.)

**Submit Render** (or press **Enter**) — queues the render and sends it to Graydient. The button briefly shows **Queued!** as confirmation.

**Copy Raw** — copies the Telegram-compatible raw prompt to your clipboard. You can paste this into PirateDiffusion on Telegram to run the same prompt there.

**Raw prompt view** — click the faint prompt preview at the bottom of the editor to expand the full raw prompt. You can edit it directly here; changes sync back to all controls.

#### Pasting a Telegram prompt

If you have an existing `/wf` or `/run:` prompt from Telegram, paste it directly into the descriptive text box. The app will detect it, parse all parameters, and populate all fields automatically. A green **Parsed Telegram prompt ✓** toast confirms this.

### Input Media

Some workflows require an input image, video, or multiple media files (e.g. face-swap, img2img, img2vid). When you select such a workflow, **Input Media** drop zones appear above the text area.

- **Drag and drop** a file onto the drop zone, or click it to browse
- **Paste** an image from your clipboard directly into the drop zone
- You can also paste a public URL
- The workflow selector automatically filters to compatible workflows when media is loaded
- To remove media, click the **✕** on the drop zone thumbnail

### Parameters

The parameter bar (just below the workflow header) exposes workflow-specific controls:

- **Steps** — number of diffusion steps (higher = more detail, slower)
- **Guidance** — how closely the model follows your prompt (CFG scale)
- **Size / Resolution** — output dimensions
- **Sampler**, **Scheduler**, and other workflow-specific options

Not all parameters are available for every workflow — only relevant ones are shown.

### Output Viewer

The right column shows your renders.

- **Progress bar** — updates in real-time as the render streams back
- **Result** — images are displayed inline; videos and audio are shown with a download button
- **Queue** — multiple renders can be in-flight at once. Each item in the queue shows its status (pending, rendering, done, error)
- **Spyglass** — click a completed image to open it in the full-screen zoom viewer. Scroll to zoom, drag to pan.
- **Download** — saves the result to your Downloads folder (or click the link to open in browser)

### Settings & API Key

Click the **⚙** gear icon in the top-right corner of the Workflow Selector column to open Settings.

From here you can:
- See your connected key (first 4 characters shown, rest masked)
- **Change Key** — validate and store a new API key
- **Disconnect** — delete the stored key and return to the welcome screen

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Submit render (in prompt textarea) |
| `Shift+Enter` | New line (in prompt textarea) |
| `Ctrl+Shift+D` | Open Workflow Debug Protocol |

---

## Building from Source

### Requirements

- [Node.js](https://nodejs.org) 18 or later
- npm (comes with Node.js)

### Development

```bash
npm install
npm run dev
```

This starts the Electron app in development mode with hot-reload.

### Production build

```bash
npm run build
npm run package
```

The packaged installer is output to `release/`. On Windows this is an NSIS `.exe` installer.

### Environment variables

Copy `.env.example` to `.env` if you need to point at a different API endpoint:

```
VITE_GRAYDIENT_API_URL=https://app.graydient.ai/api/v3/
```

The API key is **not** configured via `.env` — it is entered through the app's welcome screen and stored encrypted in your OS keychain.

---

## Feedback

Found a bug or have a suggestion? Message [@UnlimitedEditing](https://t.me/UnlimitedEditing) on Telegram.
