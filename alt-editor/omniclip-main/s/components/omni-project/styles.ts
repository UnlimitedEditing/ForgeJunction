import {css} from "@benev/slate"

export const styles = css`
	:host {
		display: block;
		padding: 12px;
		color: #e0e0e0;
		font-size: 13px;
	}

	.section {
		margin-bottom: 20px;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		padding-bottom: 6px;
		border-bottom: 1px solid rgba(255,255,255,0.08);
	}

	.section-header .title {
		font-weight: 600;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(255,255,255,0.5);
		flex: 1;
	}

	.section-header .hint {
		font-size: 10px;
		font-family: monospace;
		color: rgba(255,255,255,0.2);
	}

	.btn-clear {
		font-size: 10px;
		color: rgba(255,255,255,0.3);
		background: none;
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 3px;
		padding: 2px 6px;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}

	.btn-clear:hover {
		color: rgba(255,100,100,0.8);
		border-color: rgba(255,100,100,0.3);
	}

	.empty {
		font-size: 11px;
		color: rgba(255,255,255,0.2);
		text-align: center;
		padding: 12px 0;
		margin: 0;
	}

	/* ── Marker list ── */

	.marker-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.marker-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px;
		border-radius: 4px;
		background: rgba(255,255,255,0.03);
	}

	.marker-row:hover {
		background: rgba(255,255,255,0.06);
	}

	.marker-index {
		font-size: 10px;
		color: rgba(255,255,255,0.2);
		font-family: monospace;
		min-width: 14px;
		text-align: right;
	}

	.marker-diamond {
		width: 8px;
		height: 8px;
		background: #f59e0b;
		transform: rotate(45deg);
		flex-shrink: 0;
	}

	.marker-time {
		font-family: monospace;
		font-size: 12px;
		color: rgba(255,255,255,0.75);
		flex: 1;
	}

	.marker-label {
		font-size: 11px;
		color: rgba(255,255,255,0.4);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.btn-remove {
		background: none;
		border: none;
		color: rgba(255,255,255,0.15);
		cursor: pointer;
		font-size: 11px;
		padding: 2px 4px;
		border-radius: 3px;
		transition: color 0.15s;
		line-height: 1;
	}

	.btn-remove:hover {
		color: rgba(255,100,100,0.8);
	}

	/* ── Tag import ── */

	.import-controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.import-controls select {
		width: 100%;
		background: rgba(255,255,255,0.06);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 4px;
		color: #e0e0e0;
		font-size: 12px;
		padding: 5px 8px;
		cursor: pointer;
		outline: none;
	}

	.import-controls select:focus {
		border-color: rgba(108,71,255,0.5);
	}

	.import-controls select option {
		background: #1a1a1a;
	}

	.btn-import {
		background: rgba(108,71,255,0.2);
		border: 1px solid rgba(108,71,255,0.35);
		border-radius: 4px;
		color: rgba(255,255,255,0.85);
		font-size: 12px;
		padding: 6px 10px;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.btn-import:hover:not(:disabled) {
		background: rgba(108,71,255,0.35);
		border-color: rgba(108,71,255,0.6);
	}

	.btn-import:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.warning {
		font-size: 11px;
		color: rgba(245,158,11,0.7);
		margin: 0;
	}

	.info {
		font-size: 11px;
		color: rgba(255,255,255,0.3);
		margin: 0;
	}
`
