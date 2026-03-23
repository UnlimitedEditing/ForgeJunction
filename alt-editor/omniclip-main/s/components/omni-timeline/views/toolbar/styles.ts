import {css} from "@benev/slate"

export const styles = css`
	:host {
		position: sticky;
		top: 0;
		left: 0;
		z-index: 801;
		display: flex;
		min-height: 50px;
		--transition: 0.25s;
	}

	.toolbar {
		justify-content: space-between;
		display: flex;
		align-items: center;
		gap: 0.5em;
		width: 100%;
	}

	.tools {
		height: 50px;
		background: var(--bg-a);
		z-index: 100;
		width: 100%;
		display: flex;
		padding: 0.5em;
		align-items: center;
		justify-content: space-between;

		& .time {
			font-family: Nippo-Regular;
		}

		& button {
			cursor: pointer;
		}

		& .clean {
			display: flex;
			color: #f13131;
		}

		& .flex {
			display: flex;
			align-items: center;
			gap: 1em;

			& .split, .remove {
				display: flex;
				align-items: center;

				& svg {
					width: 17px;
				}
			}
		}
	}

	.history {
		display: flex;
		fill: rgba(255,255,255,0.2);

		& button {
			display: flex;
			align-items: center;
		}

		& button[data-past], button[data-future] {
			fill: rgba(255,255,255,0.65);
		}

	}

	.zoom {
		display: flex;
		align-items: center;

		& .zoom-in, .zoom-out {
			display: flex;
			color: rgba(255,255,255,0.65);
		}
	}

	svg {
		width: 20px;
		height: 20px;
	}

	button[disabled] {
		opacity: 0.5;
		cursor: default;
	}
`
