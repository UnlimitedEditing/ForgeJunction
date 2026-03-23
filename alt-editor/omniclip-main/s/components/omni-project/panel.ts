import {html} from "@benev/slate"
import {standard_panel_styles as styles, panel} from "@benev/construct"

import {ProjectView} from "./view.js"
import {shadow_view} from "../../context/context.js"
import timelineSvg from "../../icons/gravity-ui/timeline.svg.js"

export const ProjectPanel = panel({
	label: "Project",
	icon: timelineSvg,
	view: shadow_view(use => ({}: any) => {
		use.styles(styles)
		use.name("omni-project")
		return html`
			${ProjectView([])}
		`
	}),
})
