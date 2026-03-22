/**
 * ForgeJunction ↔ Tooscut bridge.
 *
 * ForgeJunction embeds Tooscut in an iframe and posts messages to inject
 * media assets from its render queue / active project into Tooscut's asset bin.
 *
 * Message protocol (parent → iframe):
 *   { type: 'fj:sync-library', assets: FjAssetMsg[] }
 *     – Full library sync. Adds any assets not already present.
 *   { type: 'fj:add-asset', asset: FjAssetMsg }
 *     – Single asset addition (user clicked "+" in the FJ bin).
 *
 * The `id` in FjAssetMsg is the ForgeJunction render ID and becomes the
 * Tooscut asset ID so that drag-and-drop from the FJ bin works:
 * the FJ bin sets dataTransfer `application/x-asset-id` = render.id,
 * and Tooscut's timeline drop handler looks that ID up in useAssetStore.
 */

import { useAssetStore, type MediaAsset } from "./components/timeline/use-asset-store";
import { useVideoEditorStore } from "./state/video-editor-store";

interface FjAssetMsg {
  id: string;
  url: string;
  name: string;
  type: "video" | "image" | "audio";
  thumbnailUrl?: string | null;
  prompt?: string;
}

interface MediaMetadata {
  duration: number;
  width?: number;
  height?: number;
}

/**
 * Probe the duration (and dimensions for video) of a CDN media URL.
 * Returns quickly for images (fixed 10 s default). Times out after 8 s for A/V.
 */
function probeMetadata(url: string, type: "video" | "image" | "audio"): Promise<MediaMetadata> {
  if (type === "image") return Promise.resolve({ duration: 10 });

  return new Promise((resolve) => {
    const el =
      type === "video"
        ? document.createElement("video")
        : document.createElement("audio");
    el.preload = "metadata";
    el.src = url;

    const done = (result: MediaMetadata) => {
      el.src = "";
      resolve(result);
    };

    el.onloadedmetadata = () => {
      const duration = isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      if (type === "video") {
        const v = el as HTMLVideoElement;
        done({ duration, width: v.videoWidth || undefined, height: v.videoHeight || undefined });
      } else {
        done({ duration });
      }
    };

    el.onerror = () => done({ duration: 0 });
    setTimeout(() => done({ duration: 0 }), 8000);
  });
}

/**
 * Build a MediaAsset from an FJ asset message + probed metadata.
 */
function buildAsset(msg: FjAssetMsg, meta: MediaMetadata): MediaAsset {
  return {
    id: msg.id,
    type: msg.type,
    name: msg.name,
    url: msg.url,
    duration: meta.duration,
    size: 0, // unknown without fetch; not displayed critically
    file: new File([], msg.name), // placeholder — CDN assets don't need local file access
    width: meta.width,
    height: meta.height,
    // Image assets: use the image URL itself as thumbnail if no dedicated thumbnail provided
    thumbnailUrl: msg.thumbnailUrl ?? (msg.type === "image" ? msg.url : undefined),
  };
}

/**
 * Inject a single FJ asset into both Tooscut stores (dedup by id).
 * Probes media metadata before injecting so duration/dimensions are correct.
 */
async function injectAsset(msg: FjAssetMsg): Promise<void> {
  const existing = useAssetStore.getState().assets.find((a) => a.id === msg.id);
  if (existing) return;

  const meta = await probeMetadata(msg.url, msg.type);
  const asset = buildAsset(msg, meta);

  // UI asset store (thumbnails, drag-to-timeline)
  useAssetStore.getState().addAsset(asset);

  // Editor store (persistence / project save)
  useVideoEditorStore.getState().addAssets([
    {
      id: asset.id,
      type: asset.type,
      name: asset.name,
      url: asset.url,
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
      thumbnailUrl: asset.thumbnailUrl,
    },
  ]);
}

type FjMessage =
  | { type: "fj:sync-library"; assets: FjAssetMsg[] }
  | { type: "fj:add-asset"; asset: FjAssetMsg };

function handleMessage(event: MessageEvent) {
  // Only accept messages from the parent FJ window
  if (event.source !== window.parent) return;

  const data = event.data as FjMessage;
  if (!data || typeof data.type !== "string") return;

  if (data.type === "fj:sync-library") {
    // Probe all assets in parallel so the library is ready as fast as possible
    void Promise.all(data.assets.map(injectAsset));
  } else if (data.type === "fj:add-asset") {
    void injectAsset(data.asset);
  }
}

/**
 * Inject a single FJ asset into both Tooscut stores (public export for drop handlers).
 * Returns a promise that resolves once metadata is probed and the asset is in both stores.
 */
export async function injectFjAsset(msg: FjAssetMsg): Promise<void> {
  return injectAsset(msg);
}

let registered = false;

/**
 * Register the FJ bridge message listener.
 * Safe to call multiple times — will only register once.
 * Sends `fj:bridge-ready` to the parent frame so FJ knows when to sync.
 */
export function initFjBridge() {
  if (registered || window === window.parent) return; // skip if not in iframe
  registered = true;
  window.addEventListener("message", handleMessage);
  // Notify parent that bridge is ready to receive assets
  window.parent.postMessage({ type: "fj:bridge-ready" }, "*");
}
