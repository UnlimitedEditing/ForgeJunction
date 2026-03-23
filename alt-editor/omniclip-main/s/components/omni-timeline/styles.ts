import {css} from "@benev/slate"

export const styles = css`
	:host {
		display: flex;
		flex-direction: column;
		overflow: scroll;
		position: relative;
		height: 100%;
		background: #080a0c;
	}

	.timeline {
		display: flex;
		flex-direction: column;
		user-select: none;

		& .flex {
			display: flex;

			& .add-track {
				position: sticky;
				left: 0;
				z-index: 800;
				font-family: "Nippo-Regular";
				color: rgba(255,255,255,0.7);
				border: 1px solid rgba(255,255,255,0.07);
				background: #0d1014;
				font-size: 0.8em;
				border-radius: 0;
				min-width: 120px;
				cursor: pointer;

				&:hover {
					background: #141a1f;
					color: #fff;
				}
			}
		}

		& .track-sidebars {
			position: sticky;
			width: 120px;
			left: 0;
			z-index: 800;
		}

		& .timeline-relative {
			height: 100%;
			width: 100%;
			position: relative;

			& * {
				will-change: transform;
			}

			& .timeline-info {
				position: fixed;
				display: flex;
				flex-direction: column;
				padding: 1.5em;
				gap: 0.2em;
				font-family: "Inter", "Segoe UI", system-ui, sans-serif;

				& h3 {
					font-size: 18px;
				}

				& p {
					font-size: 16px;
					color: gray;
					display: flex;
					align-items: center;
					gap: 0.3em;
				}
			}
		}

		& .transition-duration {
			position: absolute;
			z-index: 5;
			background: rgba(74,227,255,0.12);
			border-radius: 5px;
			border: 1px solid #4ae3ff;
			transition: 0.5s ease all;

			&:first-of-type {
				left: 10px;
				margin-left: -1px;
			}

			&:last-child {
				right: 10px;
				margin-right: -1px;
			}
		}

		& .transition-indicator {
			text-align: center;
			display: flex;
			background: #ff6b2b;
			border: 2px solid rgba(255,107,43,0.5);
			border-radius: 4px;
			color: white;
			align-items: center;
			justify-content: center;
			position: absolute;
			width: 20px;
			height: 20px;
			top: 15px;
			left: -10px;
			z-index: 2;
			opacity: 0;
			cursor: pointer;

			&[data-transition] {
				opacity: 1;
				z-index: 5;
			}

			&[data-selected] {

				& svg {
					z-index: 6;
					background: #ff9554;
				}
			}

			& svg {
				width: 100%;
				height: 100%;
				color: white;
				background: rgba(255,107,43,0.3);
			}

			&:hover {
				opacity: 1;
				z-index: 6;
			}
		}

		& .drop-indicator {
			height: 50px;
			border: rgba(74,227,255,0.7) dotted 2px;
			position: absolute;
			background: rgba(74,227,255,0.08);
			border-radius: 5px;
			top: 0;

			&[data-push-effects] {
				width: 10px;
				z-index: 1;
				border: 1px rgba(74,227,255,0.7) solid;
				left: -0.5px;
			}
		}
	}
`
