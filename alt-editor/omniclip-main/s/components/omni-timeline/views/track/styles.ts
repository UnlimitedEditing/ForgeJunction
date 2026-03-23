import {css} from "@benev/slate"

export const styles = css`
	.track {
		display: flex;
		position: relative;
		height: 50px;
		background: #0d1014;
		outline: 1px rgba(255,255,255,0.06) solid;

		&[data-locked] {
			background: repeating-linear-gradient(45deg, #5D5D5D, #5D5D5D 10px, #858585 10px, #858585 20px);
			z-index: 10;
			opacity: 0.5;
		}

		&[data-hidden] {
			opacity: 0.2;
		}
	}

	.indicators {
		width: 100%;
		position: relative;

		& .indicator-area {
			position: absolute;
			width: 100%;
			height: 14px;
			top: -7px;
			z-index: 10;

			&[data-indicate] {
				cursor: grabbing;
			}
		}

		& .indicator {
			display: none;
			z-index: 1;
			position: relative;
			align-items: center;
			width: 100%;
			outline: 1px solid rgba(74,227,255,0.6);

			&[data-indicate] {
				display: flex;
				background: rgba(74,227,255,0.08);
			}
		}
	}
`
