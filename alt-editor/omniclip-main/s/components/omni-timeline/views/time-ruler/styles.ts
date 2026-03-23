import {css} from "@benev/slate"

export const styles = css`
	:host {
		width: 100%;
	}

	.time-ruler {
		font-size: 0.5em;
		display: flex;
		height: 20px;
		background: rgb(26, 26, 26);
		align-items: center;
	}

	.indicator {
		pointer-events: none;
		z-index: 10;
		width: 1px;
		height: 100%;
		background: yellow;
	}

	.time {
		position: absolute;
		pointer-events: none;
	}

	.dot {
		width: 3px;
		height: 3px;
		background: gray;
		border-radius: 5px;
	}

	.content {
		position: relative;
		right: 50%;
	}

	.fj-marker {
		position: absolute;
		top: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		pointer-events: none;
		z-index: 5;
	}

	.fj-marker-diamond {
		width: 10px;
		height: 10px;
		background: #f59e0b;
		transform: translateX(-50%) rotate(45deg);
		cursor: pointer;
		pointer-events: all;
		flex-shrink: 0;
	}

	.fj-marker-diamond:hover {
		background: #fbbf24;
	}

	.fj-marker-line {
		width: 1px;
		height: 9999px;
		background: rgba(245, 158, 11, 0.35);
		pointer-events: none;
	}
`
