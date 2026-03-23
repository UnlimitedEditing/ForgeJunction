/**
 * ForgeJunction ↔ Omniclip bridge.
 *
 * ForgeJunction embeds Omniclip in an iframe and posts messages to inject
 * media assets from its render queue into Omniclip's media library and timeline.
 *
 * Message protocol (parent → iframe):
 *   { type: 'fj:sync-library', assets: FjAsset[] }
 *     – Full library sync.  Adds any assets not already present.
 *   { type: 'fj:add-asset', asset: FjAsset }
 *     – Single asset addition (user clicked "+" in the FJ bin).
 *   { type: 'fj:import-tag', assets: FjAsset[], tagName: string }
 *     – Place N-th asset at N-th sorted timeline marker.
 *   { type: 'fj:sync-tags', tags: FjTag[], tagAssets: Record<string, FjAsset[]> }
 *     – Tag metadata sync for the Project panel.
 *
 * The `id` in FjAsset is the ForgeJunction render ID.  It is mapped to the
 * Omniclip file hash so that drop handlers can look assets up by either key.
 */

import {generate_id} from "@benev/slate/x/tools/generate_id.js"
import {quick_hash} from "@benev/construct"

import {omnislate} from "./context.js"
import type {VideoEffect, AudioEffect, ImageEffect, EffectRect, FjTag, FjTagAsset} from "./types.js"
import type {VideoFile, AudioFile, ImageFile} from "../components/omni-media/types.js"

// ── Types ────────────────────────────────────────────────────────────────────

interface FjAsset {
	id: string
	url: string
	name: string
	type: "video" | "image" | "audio"
	thumbnailUrl?: string | null
	prompt?: string
}

type FjMessage =
	| { type: "fj:sync-library"; assets: FjAsset[] }
	| { type: "fj:add-asset"; asset: FjAsset }
	| { type: "fj:import-tag"; assets: FjAsset[]; tagName: string }
	| { type: "fj:sync-tags"; tags: FjTag[]; tagAssets: Record<string, FjTagAsset[]> }
	| { type: "fj:open-project-with-assets"; assets: FjAsset[] }
	| { type: "fj:rename-project"; name: string }
	| { type: "fj:trigger-export" }

// ── Module state ──────────────────────────────────────────────────────────────

/** Maps FJ render ID → Omniclip file hash (for dedup and effect building). */
const fjAssetToHash = new Map<string, string>()

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetch_with_timeout(url: string, timeout_ms = 30_000): Promise<Response> {
	const controller = new AbortController()
	const id = setTimeout(() => controller.abort(), timeout_ms)
	return fetch(url, {signal: controller.signal}).finally(() => clearTimeout(id))
}

/**
 * Probe the duration of a CDN media URL via an HTML media element.
 * Returns milliseconds; falls back to 0 on error or timeout.
 */
function probe_duration_ms(url: string, type: "video" | "audio"): Promise<number> {
	return new Promise(resolve => {
		const el = document.createElement(type)
		el.preload = "metadata"
		el.src = url
		const done = (ms: number) => { el.src = ""; resolve(ms) }
		el.onloadedmetadata = () =>
			done(isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 0)
		el.onerror = () => done(0)
		setTimeout(() => done(0), 8_000)
	})
}

function default_rect(width: number, height: number): EffectRect {
	return {
		width,
		height,
		scaleX: 1,
		scaleY: 1,
		position_on_canvas: {x: width / 2, y: height / 2},
		rotation: 0,
		pivot: {x: 0, y: 0},
	}
}

// ── Core injection ─────────────────────────────────────────────────────────────

/**
 * Fetch a CDN asset, store it in the Omniclip media map, and return its hash.
 * Idempotent — repeated calls for the same FJ asset id return the cached hash.
 */
async function inject_fj_asset(asset: FjAsset): Promise<string | null> {
	if (fjAssetToHash.has(asset.id)) return fjAssetToHash.get(asset.id)!

	const context = omnislate.context
	const media_ctrl = context.controllers.media

	// 1. Probe duration (fast — just loads metadata headers, no full download)
	let duration_ms = 5_000 // default for images
	if (asset.type === "video") duration_ms = await probe_duration_ms(asset.url, "video")
	else if (asset.type === "audio") duration_ms = await probe_duration_ms(asset.url, "audio")

	// 2. Fetch full content to build a File (required for compositor playback)
	let file: File
	try {
		const resp = await fetch_with_timeout(asset.url)
		const blob = await resp.blob()
		const mime = blob.type || (
			asset.type === "video" ? "video/mp4"
			: asset.type === "audio" ? "audio/mpeg"
			: "image/png"
		)
		file = new File([blob], asset.name, {type: mime})
	} catch {
		console.warn("[fj-bridge] Failed to fetch asset:", asset.url)
		return null
	}

	// 3. Hash and dedup
	const hash = await quick_hash(file)
	fjAssetToHash.set(asset.id, hash)

	if (!media_ctrl.has(hash)) {
		// 4. Store directly in the media Map (bypass DB + WASM analysis)
		//    We already have reliable duration from the probe step above.
		if (asset.type === "video") {
			const fps = 30
			const media: VideoFile = {file, hash, kind: "video", frames: Math.round(duration_ms / 1000 * fps), duration: duration_ms, fps, proxy: false}
			media_ctrl.set(hash, media)
			media_ctrl.on_media_change.publish({files: [media], action: "added"})
		} else if (asset.type === "audio") {
			const media: AudioFile = {file, hash, kind: "audio"}
			media_ctrl.set(hash, media)
			media_ctrl.on_media_change.publish({files: [media], action: "added"})
		} else {
			const media: ImageFile = {file, hash, kind: "image"}
			media_ctrl.set(hash, media)
			media_ctrl.on_media_change.publish({files: [media], action: "added"})
		}
	}

	return hash
}

/**
 * Build an Omniclip effect from an injected FJ asset.
 * `start_ms` is the timeline start time in milliseconds.
 * `duration_ms` is the clip duration on the timeline in milliseconds.
 */
function build_effect(
	asset: FjAsset,
	hash: string,
	start_ms: number,
	duration_ms: number,
): VideoEffect | AudioEffect | ImageEffect {
	const context = omnislate.context
	const zoom = context.state.zoom
	// Convert ms time → pixel position at current zoom level
	const start_at_position = start_ms / Math.pow(2, -zoom)
	const {width, height} = context.state.settings
	const id = generate_id()

	const base = {
		id,
		start_at_position,
		duration: duration_ms,
		start: 0,
		end: duration_ms,
		track: 0,
	}

	if (asset.type === "video") {
		return {
			...base,
			kind: "video",
			file_hash: hash,
			name: asset.name,
			thumbnail: asset.thumbnailUrl ?? "",
			raw_duration: duration_ms,
			frames: Math.round(duration_ms / 1000 * 30),
			rect: default_rect(width, height),
		} satisfies VideoEffect
	} else if (asset.type === "audio") {
		return {
			...base,
			kind: "audio",
			file_hash: hash,
			name: asset.name,
			raw_duration: duration_ms,
		} satisfies AudioEffect
	} else {
		return {
			...base,
			kind: "image",
			file_hash: hash,
			name: asset.name,
			rect: default_rect(width, height),
		} satisfies ImageEffect
	}
}

// ── Message handlers ──────────────────────────────────────────────────────────

/**
 * Navigate to a fresh Omniclip project, inject the given assets, and place
 * them sequentially on track 0 starting at t=0.
 */
async function open_project_with_assets(assets: FjAsset[]): Promise<void> {
	// 1. Create a new project ID and navigate the hash router to it
	const projectId = generate_id()
	window.location.hash = `#/editor/${projectId}`

	// 2. Wait until omnislate.context has reinitialised for the new project
	//    (setupContext replaces omnislate.context synchronously when the
	//    router fires, but the hash change is async).
	await new Promise<void>(resolve => {
		const poll = setInterval(() => {
			try {
				if (omnislate.context?.state?.projectId === projectId) {
					clearInterval(poll)
					resolve()
				}
			} catch {}
		}, 100)
		// Safety timeout — proceed anyway after 6 s to avoid hanging forever
		setTimeout(() => { clearInterval(poll); resolve() }, 6_000)
	})

	// 3. Inject and place each asset sequentially on the timeline
	const context = omnislate.context
	let cursor_ms = 0
	for (const asset of assets) {
		const hash = await inject_fj_asset(asset)
		if (!hash) continue

		const media_entry = context.controllers.media.get(hash)
		const duration_ms = (media_entry as {duration?: number} | undefined)?.duration ?? 5_000

		const effect = build_effect(asset, hash, cursor_ms, duration_ms)
		if (asset.type === "video") {
			context.actions.add_video_effect(effect as VideoEffect)
		} else if (asset.type === "audio") {
			context.actions.add_audio_effect(effect as AudioEffect)
		} else {
			context.actions.add_image_effect(effect as ImageEffect)
		}
		cursor_ms += duration_ms
	}

	context.controllers.compositor.update_canvas_objects(context.state)
}

async function sync_library(assets: FjAsset[]): Promise<void> {
	await Promise.all(assets.map(inject_fj_asset))
}

async function import_tag_to_markers(assets: FjAsset[]): Promise<void> {
	// Inject all assets in parallel first
	const hashes = await Promise.all(assets.map(inject_fj_asset))

	const context = omnislate.context
	const sorted_markers = [...context.state.markers].sort((a, b) => a.time - b.time)
	if (sorted_markers.length === 0) return

	for (let i = 0; i < assets.length && i < sorted_markers.length; i++) {
		const hash = hashes[i]
		if (!hash) continue

		const asset = assets[i]
		const marker = sorted_markers[i]

		// Get actual duration from the probed/stored media entry
		const media_entry = context.controllers.media.get(hash)
		const duration_ms = (media_entry as VideoFile | undefined)?.duration ?? 5_000

		const effect = build_effect(asset, hash, marker.time, duration_ms)

		if (asset.type === "video") {
			context.actions.add_video_effect(effect as VideoEffect)
		} else if (asset.type === "audio") {
			context.actions.add_audio_effect(effect as AudioEffect)
		} else {
			context.actions.add_image_effect(effect as ImageEffect)
		}
	}

	// Refresh compositor canvas objects to reflect new effects
	context.controllers.compositor.update_canvas_objects(context.state)
}

function handle_message(event: MessageEvent): void {
	// Only accept messages from the FJ parent frame
	if (event.source !== window.parent) return

	const data = event.data as FjMessage
	if (!data || typeof data.type !== "string") return

	if (data.type === "fj:sync-library") {
		void sync_library(data.assets)
	} else if (data.type === "fj:add-asset") {
		void inject_fj_asset(data.asset)
	} else if (data.type === "fj:import-tag") {
		void import_tag_to_markers(data.assets)
	} else if (data.type === "fj:sync-tags") {
		omnislate.context.actions.set_fj_tags(data.tags, data.tagAssets, {omit: true})
	} else if (data.type === "fj:open-project-with-assets") {
		void open_project_with_assets(data.assets)
	} else if (data.type === "fj:rename-project") {
		omnislate.context.actions.set_project_name(data.name)
	}
}

// ── Public API ────────────────────────────────────────────────────────────────

let registered = false

/**
 * Register the FJ bridge message listener.
 * Safe to call multiple times — only registers once.
 * Sends `fj:bridge-ready` to the parent frame so FJ knows to sync assets.
 */
export function init_fj_bridge(): void {
	if (registered || window === window.parent) return
	registered = true
	window.addEventListener("message", handle_message)
	window.parent.postMessage({type: "fj:bridge-ready"}, "*")
}

/**
 * Public export of import_tag_to_markers for the Project panel component.
 */
export {import_tag_to_markers}
