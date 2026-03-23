import {html} from "@benev/slate"

import {styles} from "./styles.js"
import {shadow_view} from "../../context/context.js"
import {import_tag_to_markers} from "../../context/fj-bridge.js"

function format_time(ms: number): string {
	const total_s = Math.floor(ms / 1000)
	const m = Math.floor(total_s / 60)
	const s = total_s % 60
	const ms_part = Math.floor(ms % 1000)
	return `${m}:${String(s).padStart(2, "0")}.${String(ms_part).padStart(3, "0")}`
}

export const ProjectView = shadow_view(use => () => {
	use.styles(styles)
	use.watch(() => use.context.state)

	const actions = use.context.actions
	const {markers, fj_tags, fj_tag_assets} = use.context.state

	// ── Markers section ───────────────────────────────────────────────────────

	const render_markers = () => html`
		<div class="section">
			<div class="section-header">
				<span class="title">Markers</span>
				<span class="hint">M · Ctrl+M · Shift+M</span>
				${markers.length > 0 ? html`
					<button class="btn-clear" @click=${() => actions.clear_markers()}>
						Clear all
					</button>
				` : null}
			</div>
			${markers.length === 0
				? html`<p class="empty">No markers — press M to add one</p>`
				: html`
					<ul class="marker-list">
						${markers.map((marker, i) => html`
							<li class="marker-row">
								<span class="marker-index">${i + 1}</span>
								<span class="marker-diamond"></span>
								<span class="marker-time">${format_time(marker.time)}</span>
								${marker.label
									? html`<span class="marker-label">${marker.label}</span>`
									: null}
								<button
									class="btn-remove"
									title="Remove marker"
									@click=${() => actions.remove_marker(marker.id)}
								>✕</button>
							</li>
						`)}
					</ul>
				`}
		</div>
	`

	// ── Tag → Markers import section ──────────────────────────────────────────

	const render_tag_import = () => {
		if (fj_tags.length === 0) return html`
			<div class="section">
				<div class="section-header">
					<span class="title">Tag → Markers</span>
				</div>
				<p class="empty">No tags synced — open a project in FJ</p>
			</div>
		`

		const handle_import = (e: Event) => {
			const btn = e.currentTarget as HTMLButtonElement
			const select = btn.closest(".import-controls")
				?.querySelector("select") as HTMLSelectElement | null
			const tagId = select?.value
			if (!tagId) return
			const assets = fj_tag_assets[tagId] ?? []
			if (assets.length > 0) import_tag_to_markers(assets)
		}

		return html`
			<div class="section">
				<div class="section-header">
					<span class="title">Tag → Markers</span>
				</div>
				<div class="import-controls">
					<select>
						${fj_tags.map(tag => {
							const count = (fj_tag_assets[tag.id] ?? []).length
							return html`
								<option value="${tag.id}">
									${tag.name} (${count} asset${count === 1 ? "" : "s"})
								</option>
							`
						})}
					</select>
					<button
						class="btn-import"
						?disabled=${markers.length === 0}
						@click=${handle_import}
					>
						Import to Markers
					</button>
					${markers.length === 0
						? html`<p class="warning">Add markers first (press M on the timeline)</p>`
						: null}
				</div>
			</div>
		`
	}

	return html`
		${render_markers()}
		${render_tag_import()}
	`
})
