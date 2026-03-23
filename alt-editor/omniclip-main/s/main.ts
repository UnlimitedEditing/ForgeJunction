import {register_to_dom, html, Nexus} from "@benev/slate"
import {ConstructEditor, single_panel_layout} from "@benev/construct/x/mini.js"

import {Tooltip} from './views/tooltip/view.js'
import {HashRouter} from './tools/hash-router.js'
import {TestEnvAlert} from './views/test-env-alert.js'
import checkSvg from './icons/gravity-ui/check.svg.js'
import exportSvg from './icons/gravity-ui/export.svg.js'
import {ShortcutsManager} from './views/shortcuts/view.js'
import {TextPanel} from "./components/omni-text/panel.js"
import {AnimPanel} from "./components/omni-anim/panel.js"
import {MediaPanel} from "./components/omni-media/panel.js"
import {ProjectPanel} from "./components/omni-project/panel.js"
import {OmniText} from "./components/omni-text/component.js"
import {OmniAnim} from "./components/omni-anim/component.js"
import {OmniMedia} from "./components/omni-media/component.js"
import {FiltersPanel} from './components/omni-filters/panel.js'
import {TimelinePanel} from "./components/omni-timeline/panel.js"
import {LandingPage} from './components/landingpage/component.js'
import {OmniManager} from './components/omni-manager/component.js'
import {OmniFilters} from './components/omni-filters/component.js'
import {CollaborationManager} from './views/collaboration/view.js'
import {OmniTimeline} from "./components/omni-timeline/component.js"
import pencilSquareSvg from './icons/gravity-ui/pencil-square.svg.js'
import {ProjectSettingsPanel} from "./views/project-settings/panel.js"
import {TransitionsPanel} from "./components/omni-transitions/panel.js"
import {omnislate, OmniContext, collaboration} from "./context/context.js"
import {init_fj_bridge} from "./context/fj-bridge.js"
import {OmniTransitions} from "./components/omni-transitions/component.js"
import {ExportPanel} from "./components/omni-timeline/views/export/panel.js"
import {MediaPlayerPanel} from "./components/omni-timeline/views/media-player/panel.js"
import {ExportConfirmModal, ExportInProgressOverlay} from './components/omni-timeline/views/export/view.js'

const IS_TEST_ENV = window.location.hostname.startsWith("test")

export function setupContext(projectId: string) {
	omnislate.context = new OmniContext({
		projectId,
		panels: {
			TimelinePanel,
			MediaPanel,
			MediaPlayerPanel,
			TextPanel,
			ExportPanel,
			ProjectSettingsPanel,
			AnimPanel,
			FiltersPanel,
			TransitionsPanel,
			ProjectPanel,
		},
		layouts: {
			empty: single_panel_layout("TimelinePanel"),
			default: single_panel_layout("TimelinePanel"),
		},
	})
	return omnislate
}

register_to_dom({OmniManager, LandingPage})
let registered = false

export function removeLoadingPageIndicator() {
	const loadingPageIndicatorElement = document.querySelector(".loading-page-indicator")
	if(loadingPageIndicatorElement)
		document.body.removeChild(loadingPageIndicatorElement!)
}

const VideoEditor =  (omnislate: Nexus<OmniContext>) => omnislate.light_view((use) => () => {
	use.watch(() => use.context.state)
	const collaboration = use.context.controllers.collaboration
	const isEmbedded = window !== window.parent
	const [renameDisabled, setRenameDisabled] = use.state(true)
	const toggleProjectRename = (e: PointerEvent) => {
		e.preventDefault()
		setRenameDisabled(!renameDisabled)
	}

	const confirmProjectRename = () => {
		const projectName = use.element.querySelector(".input-name") as HTMLInputElement
		use.context.actions.set_project_name(projectName.value)
	}

	use.mount(() => {
		const disposeCollab = collaboration.onChange(() => use.rerender())

		if (isEmbedded) {
			// Post initial project name to parent
			window.parent.postMessage({ type: "fj:project-state", projectName: use.context.state.projectName }, "*")

			// Handle trigger-export message from parent
			const onMessage = (e: MessageEvent) => {
				if (e.source !== window.parent) return
				if (e.data?.type === "fj:trigger-export") {
					setShowConfirmExportModal(true)
				}
			}
			window.addEventListener("message", onMessage)
			return () => { disposeCollab(); window.removeEventListener("message", onMessage) }
		}

		return () => disposeCollab()
	})

	// Keep parent synced whenever project name changes
	use.mount(() => {
		if (!isEmbedded) return
		const prev = { name: "" }
		const dispose = use.context.state && (() => {
			const name = use.context.state.projectName
			if (name !== prev.name) {
				prev.name = name
				window.parent.postMessage({ type: "fj:project-state", projectName: name }, "*")
			}
		})
		// Use a watch — re-run on every render since use.watch already tracks state
		return () => {}
	})

	const [showConfirmExportModal, setShowConfirmExportModal] = use.state(false)
	const isClient = collaboration.client

	// Post project name on every render when embedded (lightweight, deduplicated by parent)
	if (isEmbedded) {
		window.parent.postMessage({ type: "fj:project-state", projectName: use.context.state.projectName }, "*")
	}

	return html`
		<div class=editor>
			${IS_TEST_ENV ? TestEnvAlert : null}
			${ExportConfirmModal([showConfirmExportModal, setShowConfirmExportModal])}
			${ExportInProgressOverlay([])}
			${isEmbedded ? null : html`
			<div class=editor-header>
				<div class=flex>
					<img class="logo" src="/assets/icon3.png" />
					<div class="project-name">
						<span class="box">
							<input class="input-name" ?disabled=${renameDisabled} .value=${use.context.state.projectName}>
							<span class="icons" @click=${toggleProjectRename}>
								${renameDisabled ? html`${pencilSquareSvg}` : html`<span @click=${confirmProjectRename} class="check">${checkSvg}</span>`}
							</span>
						</span>
					</div>
				</div>
				<div class="export">
					${CollaborationManager([])}
					${ShortcutsManager([])}
					${Tooltip(
						html`
						<button
							?disabled=${use.context.state.settings.bitrate <= 0 || isClient}
							class="export-button"
							@click=${() => setShowConfirmExportModal(true)}
						>
							<span class="text">${exportSvg}<span>Export</span></span>
						</button>`,
						html`${isClient ?  "Only host can export" : null}`,
						"",
						"bottom-end"
					)}
				</div>
			</div>
			`}
			<construct-editor></construct-editor>
		</div>
	`
})

const router = new HashRouter({
	'/': () => {
		return html`<landing-page></landing-page>`
	},
	'/editor': () => {
		collaboration.disconnect()
		return html`<omni-manager></omni-manager>`
	},
	'/editor/*': (projectId) => {
		if(!collaboration.initiatingProject) {
			collaboration.disconnect()
		}
		if(!registered) {
			register_to_dom({OmniTimeline, OmniText, OmniMedia, ConstructEditor, OmniFilters, OmniTransitions, OmniAnim})
			registered = true
		}
		const omnislate = setupContext(projectId)
		init_fj_bridge()
		return html`${VideoEditor(omnislate)()}`
	},
})

document.body.append(router.element)
document.documentElement.className = "sl-theme-dark"
//@ts-ignore
