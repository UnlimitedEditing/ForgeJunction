# Developer Notes — Forge Junction

A place for architectural decisions, apologies, and explanations that don't
fit neatly into a commit message.

---

## On the removal of Tooscut (March 2026)

To anyone from the Tooscut team who might stumble across this in the git
history — we're sorry.

Tooscut is a genuinely impressive piece of work. The GPU-accelerated Rust/WASM
render engine, the WebCodecs pipeline, the clean NLE architecture — it was the
right call to reach for it, and integrating it taught us a lot about how a
browser-native video editor should be structured.

We had to remove it because we missed the licensing terms on first read.
Tooscut's license does not permit embedding in a commercial closed-source
product, which Forge Junction is. That's on us entirely, not on you. By the
time we caught it, the integration was deep enough that we had to rip it out
rather than patch around it.

We replaced it with **Omniclip** (ISC licence, permissive) and carried forward
the bridge protocol, marker system, and tag→timeline import feature that was
built during the Tooscut integration. A lot of what we learned from reading
Tooscut's internals directly shaped how the Omniclip bridge was designed.

If you're reading this and you ever open-relicense Tooscut under something more
permissive — we'd genuinely consider it.

— ForgeJunction dev team

---

## Why the video editor lives in an iframe

The embedded editor (Omniclip) runs as a full SPA inside an `<iframe>` rather
than being bundled into the Electron renderer directly. The reasons:

1. **SharedArrayBuffer isolation** — FFmpeg.wasm and WebCodecs require
   `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
   require-corp`. Applying those headers to the whole FJ renderer window would
   break CDN asset loading elsewhere in the app. The iframe gets its own
   isolated browsing context with the right headers from its own HTTP server.

2. **Independent release cycle** — Omniclip can be rebuilt and redeployed
   without touching the FJ Electron shell. The postMessage bridge protocol is
   the only contract between them.

3. **Shadow DOM isolation** — Omniclip uses Lit web components with shadow DOM.
   Sharing a document with React would cause stylesheet and custom-element
   registration conflicts.

The bridge protocol is documented in full at `docs/editor-integration-spec.md`.

---

*Add new notes below this line as needed.*
