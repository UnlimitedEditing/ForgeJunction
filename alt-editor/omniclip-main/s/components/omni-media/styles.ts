import {css} from "@benev/slate"

export const styles = css`
	:host {
		display: flex;
		height: 100%;
		flex-direction: column;
		overflow: hidden;
		--ember: #ff6b2b;
		--ember-hover: #ff9554;
		--arc: #4ae3ff;
		--danger-color: #ef4444;
		--surface: #080a0c;
		--surface-raised: #0d1014;
		--surface-overlay: #141a1f;
		--border: rgba(255,255,255,0.07);
		--text-primary: rgba(255,255,255,0.9);
		--text-secondary: rgba(255,255,255,0.45);
		--card-radius: 6px;
		--transition-speed: 0.15s;
		--thumb-size: 140px;
	}

	.media-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		position: relative;
		background: var(--surface);
	}

	/* ── Header ─────────────────────────────────────────── */

	.header {
		position: sticky;
		top: 0;
		z-index: 10;
		padding: 10px 12px 8px;
		border-bottom: 1px solid var(--border);
		background: var(--surface-raised);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.bin-count {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/* ── Import button ───────────────────────────────────── */

	.import-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: var(--ember);
		color: #fff;
		padding: 5px 10px;
		border-radius: 5px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: background var(--transition-speed) ease;
		user-select: none;
		white-space: nowrap;
	}

	.import-btn:hover {
		background: var(--ember-hover);
	}

	.import-btn:active {
		background: #e55a1f;
	}

	.import-icon svg {
		width: 13px;
		height: 13px;
	}

	.hide {
		display: none;
	}

	/* ── Thumbnail size slider ───────────────────────────── */

	.thumb-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 80px;
		height: 3px;
		background: var(--border);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}

	.thumb-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ember);
		cursor: pointer;
		transition: background var(--transition-speed);
	}

	.thumb-slider::-webkit-slider-thumb:hover {
		background: var(--ember-hover);
	}

	/* ── Media grid ──────────────────────────────────────── */

	.media-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--thumb-size), 1fr));
		gap: 8px;
		padding: 10px;
		overflow-y: auto;
		align-content: start;
	}

	.media-card {
		position: relative;
		border-radius: var(--card-radius);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		transition: border-color var(--transition-speed) ease, transform var(--transition-speed) ease;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.media-card:hover {
		border-color: rgba(255,107,43,0.35);
		transform: translateY(-1px);
	}

	/* ── Thumbnail ───────────────────────────────────────── */

	.media-element {
		position: relative;
		background: var(--surface);
		overflow: hidden;
		aspect-ratio: 16/9;
	}

	.media-element img,
	.media-element video {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.audio-wave {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
		background: linear-gradient(135deg, #0d1014 0%, #141a1f 100%);
	}

	.audio-wave svg {
		width: 50%;
		height: 50%;
		color: var(--ember);
		opacity: 0.6;
	}

	/* ── Overlay ─────────────────────────────────────────── */

	.media-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 55%);
		opacity: 0;
		transition: opacity var(--transition-speed) ease;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 6px;
	}

	.media-card:hover .media-overlay {
		opacity: 1;
	}

	.media-type-badge {
		align-self: flex-start;
		background: rgba(0,0,0,0.65);
		color: rgba(255,255,255,0.75);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 5px;
		border-radius: 3px;
		backdrop-filter: blur(4px);
	}

	.media-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}

	.action-btn {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: rgba(0,0,0,0.6);
		backdrop-filter: blur(4px);
		border: none;
		cursor: pointer;
		transition: background var(--transition-speed) ease, transform var(--transition-speed) ease;
	}

	.action-btn svg {
		width: 13px;
		height: 13px;
	}

	.add-btn {
		color: var(--ember);
	}

	.add-btn:hover {
		background: rgba(255,107,43,0.25);
		transform: scale(1.1);
	}

	.delete-btn {
		color: var(--danger-color);
	}

	.delete-btn:hover {
		background: rgba(239,68,68,0.2);
		transform: scale(1.1);
	}

	/* ── File name label ─────────────────────────────────── */

	.media-info {
		padding: 5px 7px;
		background: var(--surface-raised);
	}

	.media-name {
		display: block;
		font-size: 0.72rem;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Loading placeholder ─────────────────────────────── */

	.placeholder {
		display: flex;
		justify-content: center;
		align-items: center;
		aspect-ratio: 16/9;
		background: var(--surface-raised);
	}

	.placeholder-animation {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		height: 100%;
		animation: pulse 1.5s infinite ease-in-out;
	}

	.placeholder-animation svg {
		width: 30px;
		height: 30px;
		opacity: 0.4;
		color: var(--ember);
	}

	@keyframes pulse {
		0% { opacity: 0.5; }
		50% { opacity: 1; }
		100% { opacity: 0.5; }
	}

	/* ── Empty state ─────────────────────────────────────── */

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 24px;
		text-align: center;
		color: var(--text-secondary);
		flex: 1;
		gap: 6px;
	}

	.empty-icon svg {
		width: 36px;
		height: 36px;
		opacity: 0.3;
		color: var(--ember);
		margin-bottom: 8px;
	}

	.empty-text {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(255,255,255,0.5);
	}

	.empty-subtext {
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	/* ── Drag & drop overlay ─────────────────────────────── */

	.drag-message {
		position: absolute;
		inset: 0;
		background: rgba(8,10,12,0.75);
		backdrop-filter: blur(4px);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 20;
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--transition-speed) ease;
	}

	.drag-active .drag-message {
		opacity: 1;
		pointer-events: auto;
	}

	.drag-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 28px 36px;
		background: var(--surface-raised);
		border-radius: 10px;
		border: 2px dashed var(--ember);
	}

	.drag-icon svg {
		width: 40px;
		height: 40px;
		color: var(--ember);
	}

	.drag-text {
		font-size: 1rem;
		font-weight: 600;
		color: rgba(255,255,255,0.85);
	}
`
