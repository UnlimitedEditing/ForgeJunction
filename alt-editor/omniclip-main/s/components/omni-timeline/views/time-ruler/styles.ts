import {css} from "@benev/slate"

export const styles = css`
	:host {
		width: 100%;
	}

	.time-ruler {
		font-size: 0.5em;
		display: flex;
		height: 20px;
		background: #0d1014;
		align-items: center;
		position: relative;   /* anchors .fj-marker absolute children to this ruler */
		overflow: visible;    /* lets the diamond and line bleed outside the 20px strip */
	}

	.indicator {
		pointer-events: none;
		z-index: 10;
		width: 1px;
		height: 100%;
		background: #ff6b2b;
	}

	.time {
		position: absolute;
		pointer-events: none;
	}

	.dot {
		width: 3px;
		height: 3px;
		background: rgba(255,255,255,0.25);
		border-radius: 5px;
	}

	.content {
		position: relative;
		right: 50%;
	}

	.fj-marker {
		position: absolute;
		/* Sit the container so the diamond tip lands exactly on the ruler's top border */
		top: -8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		pointer-events: none;
		z-index: 6;
	}

	.fj-marker-diamond {
		width: 10px;
		height: 10px;
		background: #ff6b2b;
		/* translateX(-50%) centres the diamond on the left anchor */
		transform: translateX(-50%) rotate(45deg);
		cursor: pointer;
		pointer-events: all;
		flex-shrink: 0;
		transition: background 0.1s, box-shadow 0.1s, transform 0.1s;
	}

	.fj-marker-diamond:hover {
		background: #ff9554;
		box-shadow: 0 0 5px 1px rgba(255, 107, 43, 0.6);
	}

	.fj-marker-diamond[data-active] {
		background: #fff;
		box-shadow: 0 0 7px 2px rgba(255, 107, 43, 0.9);
		transform: translateX(-50%) rotate(45deg) scale(1.35);
	}

`
