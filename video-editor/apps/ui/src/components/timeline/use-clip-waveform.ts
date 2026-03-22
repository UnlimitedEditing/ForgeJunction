/**
 * useClipWaveform - Hook to get waveform data for audio clips.
 *
 * Extracts waveform data via a web worker (off main thread) for local blob: assets.
 * For CDN assets (injected via FJ bridge), uses Web Audio API on the main thread —
 * the same decoding path used by the export pipeline, which is reliable in Electron.
 */

import { useEffect, useRef, useState } from "react";
import { extractWaveform } from "../../workers/waveform-api";
import { useAssetStore } from "./use-asset-store";

export interface WaveformData {
  data: number[];
  duration: number;
}

// Global cache: assetId -> waveform data
const waveformCache = new Map<string, WaveformData>();
// Track in-flight extractions to avoid duplicates
const pendingExtractions = new Set<string>();

interface AudioClipLike {
  id: string;
  type: string;
  assetId?: string;
}

// ── Web Audio waveform extraction (for CDN assets) ───────────────────────────

function computeRmsWaveform(channelData: Float32Array, duration: number): number[] {
  const SAMPLES_PER_SECOND = 30;
  const targetSamples = Math.max(100, Math.ceil(duration * SAMPLES_PER_SECOND));
  const samplesPerBar = Math.max(1, Math.floor(channelData.length / targetSamples));

  const raw: number[] = [];
  for (let i = 0; i < targetSamples; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, channelData.length);
    if (start >= channelData.length) break;
    let sum = 0;
    for (let j = start; j < end; j++) sum += channelData[j] * channelData[j];
    raw.push(Math.sqrt(sum / (end - start)));
  }

  // Normalise to 0–1
  let max = 0.001;
  for (const v of raw) if (v > max) max = v;
  return raw.map((v) => Math.min(1, v / max));
}

async function extractWaveformViaWebAudio(
  url: string,
): Promise<WaveformData | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const data = computeRmsWaveform(audioBuffer.getChannelData(0), audioBuffer.duration);
      return { data, duration: audioBuffer.duration };
    } finally {
      await audioContext.close();
    }
  } catch {
    return null;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook that returns a map of assetId -> WaveformData for all audio clips.
 * Triggers extraction for any audio clips whose waveform isn't cached yet.
 */
export function useClipWaveforms(clips: AudioClipLike[]): Map<string, WaveformData> {
  const [waveforms, setWaveforms] = useState<Map<string, WaveformData>>(() => new Map());
  const assets = useAssetStore((state) => state.assets);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const audioClips = clips.filter(
      (c): c is AudioClipLike & { assetId: string } => c.type === "audio" && !!c.assetId,
    );

    const neededAssetIds = new Set<string>();
    const currentWaveforms = new Map<string, WaveformData>();

    for (const clip of audioClips) {
      const cached = waveformCache.get(clip.assetId);
      if (cached) {
        currentWaveforms.set(clip.assetId, cached);
      } else {
        neededAssetIds.add(clip.assetId);
      }
    }

    if (currentWaveforms.size > 0) {
      setWaveforms((prev) => {
        const next = new Map(prev);
        for (const [k, v] of currentWaveforms) next.set(k, v);
        return next;
      });
    }

    for (const assetId of neededAssetIds) {
      if (pendingExtractions.has(assetId)) continue;

      const asset = assets.find((a) => a.id === assetId);
      if (!asset?.url) continue;

      pendingExtractions.add(assetId);

      const isCdnAsset = !asset.url.startsWith("blob:");

      const finish = (result: WaveformData | null) => {
        pendingExtractions.delete(assetId);
        if (!result || !mountedRef.current) return;
        waveformCache.set(assetId, result);
        setWaveforms((prev) => {
          const next = new Map(prev);
          next.set(assetId, result);
          return next;
        });
      };

      if (isCdnAsset) {
        // Use Web Audio API on the main thread — same path as export, reliable in Electron
        void extractWaveformViaWebAudio(asset.url).then(finish).catch(() => {
          pendingExtractions.delete(assetId);
        });
      } else {
        // Local blob: URL — use the off-thread MediaBunny worker
        void extractWaveform(assetId, asset.url).then((result) => {
          finish(
            result
              ? { data: result.waveformData, duration: result.duration }
              : null,
          );
        });
      }
    }
  }, [clips, assets]);

  return waveforms;
}
