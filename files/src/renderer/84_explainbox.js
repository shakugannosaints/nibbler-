"use strict";

const move_explainer = require("./modules/move_explainer");

function explanation_score(info) {
	if (!info || !info.__touched) {
		return -1000000;
	}

	if (typeof info.mate === "number" && info.mate !== 0) {
		return info.mate > 0 ? 30000 - info.mate : -30000 - info.mate;
	}

	if (typeof info.cp === "number") {
		return info.cp;
	}

	if (typeof info.q === "number") {
		return Math.round(info.q * 1000);
	}

	return -1000000;
}

function sorted_explanation_infos(info_list) {
	return Array.from(info_list).sort((a, b) => {
		if (!!a.__touched !== !!b.__touched) {
			return a.__touched ? -1 : 1;
		}

		let score_diff = explanation_score(b) - explanation_score(a);
		if (score_diff !== 0) {
			return score_diff;
		}

		if ((a.multipv || 999) !== (b.multipv || 999)) {
			return (a.multipv || 999) - (b.multipv || 999);
		}

		return (a.move || "").localeCompare(b.move || "");
	});
}

let explainbox_props = {

	must_draw_explainbox: function() {
		this.last_drawn_explanation_signature = null;
	},

	info_lines_are_valid_for_node: function(node) {
		if (!node || this.info_line_moves_node_id === null) {
			return false;
		}
		return node.id === this.info_line_moves_node_id;
	},

	move_from_line_n: function(node, n) {
		if (!this.info_lines_are_valid_for_node(node)) {
			return null;
		}
		if (typeof n !== "number" || Number.isNaN(n) || n < 0 || n >= this.info_line_moves.length) {
			return null;
		}
		return this.info_line_moves[n] || null;
	},

	hovered_info_move: function(node) {
		if (!this.info_lines_are_valid_for_node(node)) {
			return null;
		}

		let overlist = document.querySelectorAll(":hover");

		for (let item of overlist) {
			if (typeof item.id === "string" && item.id.startsWith("infoline_")) {
				let n = parseInt(item.id.slice("infoline_".length), 10);
				return this.move_from_line_n(node, n);
			}
		}

		return null;
	},

	explainbox_hovered: function() {
		let overlist = document.querySelectorAll(":hover");

		for (let item of overlist) {
			if (item && item.id === "explainbox") {
				return true;
			}
			if (item && typeof item.closest === "function" && item.closest("#explainbox")) {
				return true;
			}
		}

		return false;
	},

	merged_explanation_info_list: function(info_list, extra_info) {
		let merged = [];
		let seen = new Set();

		for (let info of Array.isArray(info_list) ? info_list : []) {
			if (!info || seen.has(info.move)) {
				continue;
			}
			seen.add(info.move);
			merged.push(info);
		}

		if (extra_info && !seen.has(extra_info.move)) {
			merged.push(extra_info);
		} else if (extra_info) {
			merged = merged.map(info => info.move === extra_info.move ? extra_info : info);
		}

		return sorted_explanation_infos(merged);
	},

	explanation_cache_get: function(node, info, best_info, second_info, info_list, analysis_version) {
		if (!node || !info) {
			return null;
		}

		let language = config.language || "English";
		let version = node.table ? node.table.version : 0;
		let key = `${node.id}|${info.move}|${version}|${analysis_version || 0}|${language}`;

		if (!this.explanation_cache) {
			this.explanation_cache = new Map();
		}

		if (this.explanation_cache.has(key)) {
			return this.explanation_cache.get(key);
		}

		let explanation = move_explainer.explainMove({
			node,
			info,
			bestInfo: best_info,
			secondInfo: second_info,
			infoList: info_list
		});

		this.explanation_cache.set(key, explanation);

		if (this.explanation_cache.size > 800) {
			this.explanation_cache.clear();
			this.explanation_cache.set(key, explanation);
		}

		return explanation;
	},

	explanation_popup_html: function() {
		return this.last_explanation_popup_html || "";
	},

	render_explainbox_section: function(section_key, title, body_html) {
		if (!body_html) {
			return "";
		}

		return (
			`<div class="explainbox_section" data-section-key="${SafeStringHTML(section_key)}">` +
				`<div class="explainbox_section_summary gray">${SafeStringHTML(title)}</div>` +
				`<div class="explainbox_section_body">${body_html}</div>` +
			`</div>`
		);
	},

	set_explanation_popup_payload: function(title, html) {
		this.last_explanation_popup_title = title || translate.t("Move explanation");
		this.last_explanation_popup_html = html || "";

		if (typeof ipcRenderer !== "undefined") {
			ipcRenderer.send("update_explanation_popup", {
				title: this.last_explanation_popup_title,
				html: this.last_explanation_popup_html
			});
		}
	},

	draw_explainbox: function(node, fixed_move, preview_move, hover_state) {
		let panel_visible = !!config.show_explanation_panel;

		if (!panel_visible) {
			explainbox.innerHTML = "";
		}

		let base_info_list = (!node || node.destroyed || node.terminal_reason()) ? [] : SortedMoveInfo(node);
		let hover_info = hover_state && hover_state.info ? hover_state.info : null;
		let base_touched_list = base_info_list.filter(info => info.__touched);
		let info_list = this.merged_explanation_info_list(base_info_list, hover_info);
		if (base_touched_list[0]) {
			info_list = [base_touched_list[0]].concat(info_list.filter(info => info.move !== base_touched_list[0].move));
		}
		let touched_list = info_list.filter(info => info.__touched);
		let selected_move = preview_move || fixed_move || (touched_list[0] ? touched_list[0].move : (info_list[0] ? info_list[0].move : null));
		let selected_info = (hover_info && hover_info.move === selected_move ? hover_info : null) || info_list.find(info => info.move === selected_move) || touched_list[0] || info_list[0] || null;
		let best_info = base_touched_list[0] || touched_list[0] || selected_info;
		let second_info = base_touched_list.find(info => best_info && info.move !== best_info.move) || touched_list.find(info => best_info && info.move !== best_info.move) || null;
		let analysis_version = selected_info && selected_info.__hover_source ? (selected_info.__hover_cache_version || 0) : 0;
		let hover_status = (hover_state && hover_state.move === selected_move) ? hover_state.status : "";
		let learning_feedback = (config.show_learning_feedback && !preview_move && !fixed_move && node && node.learning_feedback) ? node.learning_feedback : null;
		let learning_signature = learning_feedback ? (learning_feedback.signature || learning_feedback.move || "learning") : "";
		let signature = `${panel_visible}|${config.show_learning_feedback}|${config.language}|${node ? node.id : "null"}|${node && node.table ? node.table.version : "null"}|${selected_move || ""}|${preview_move || ""}|${fixed_move || ""}|${analysis_version}|${hover_status}|${learning_signature}`;

		if (signature === this.last_drawn_explanation_signature) {
			return;
		}

		this.last_drawn_explanation_signature = signature;

		if (!node || node.destroyed) {
			if (panel_visible) {
				explainbox.innerHTML = "";
			}
			this.set_explanation_popup_payload(translate.t("Move explanation"), "");
			return;
		}

		let rendered_learning = learning_feedback ? move_explainer.renderLearningFeedback(learning_feedback, key => translate.t(key)) : null;
		let learning_html = "";

		if (rendered_learning) {
			let learning_rows = "";

			if (rendered_learning.issue_text) {
				learning_rows +=
					`<div class="learning_feedback_row"><span class="gray">${SafeStringHTML(rendered_learning.issue_label)}:</span> ${SafeStringHTML(rendered_learning.issue_text)}</div>`;
			}
			if (rendered_learning.better_text) {
				learning_rows +=
					`<div class="learning_feedback_row"><span class="gray">${SafeStringHTML(rendered_learning.better_label)}:</span> ${SafeStringHTML(rendered_learning.better_text)}</div>`;
			}
			if (rendered_learning.reply_text) {
				learning_rows +=
					`<div class="learning_feedback_row"><span class="gray">${SafeStringHTML(rendered_learning.reply_label)}:</span> ${SafeStringHTML(rendered_learning.reply_text)}</div>`;
			}
			if (rendered_learning.note_text) {
				learning_rows +=
					`<div class="learning_feedback_row learning_feedback_note"><span class="gray">${SafeStringHTML(rendered_learning.note_label)}:</span> ${SafeStringHTML(rendered_learning.note_text)}</div>`;
			}

			learning_html =
				`<div class="learning_feedback_card">` +
					`<div class="learning_feedback_header">` +
						`<span class="blue">${SafeStringHTML(rendered_learning.title)}</span>` +
						`<span class="learning_feedback_badge learning_feedback_${SafeStringHTML(rendered_learning.status_tone)}">${SafeStringHTML(rendered_learning.status)}</span>` +
					`</div>` +
					`<div class="learning_feedback_move"><span class="gray">${SafeStringHTML(rendered_learning.move_label)}:</span> <span class="white">${SafeStringHTML(rendered_learning.move)}</span></div>` +
					`<div class="learning_feedback_summary">${SafeStringHTML(rendered_learning.summary)}</div>` +
					learning_rows +
				`</div>`;
		}

		if (node.terminal_reason()) {
			let terminal_html =
				`<div class="explainbox_card">` +
				`<div class="explainbox_header"><span class="blue">${SafeStringHTML(translate.t("Move explanation"))}</span></div>` +
				learning_html +
				`<div class="explainbox_summary gray">${SafeStringHTML(node.terminal_reason())}</div>` +
				`</div>`;
			if (panel_visible) {
				explainbox.innerHTML = terminal_html;
			}
			this.set_explanation_popup_payload(translate.t("Move explanation"), terminal_html);
			return;
		}

		if (!selected_info) {
			let empty_html =
				`<div class="explainbox_card">` +
				`<div class="explainbox_header"><span class="blue">${SafeStringHTML(translate.t("Move explanation"))}</span></div>` +
				learning_html +
				`<div class="explainbox_summary gray">${SafeStringHTML(translate.t("Move explanations will appear once the engine produces candidate moves."))}</div>` +
				`</div>`;
			if (panel_visible) {
				explainbox.innerHTML = empty_html;
			}
			this.set_explanation_popup_payload(translate.t("Move explanation"), empty_html);
			return;
		}

		let explanation = this.explanation_cache_get(node, selected_info, best_info, second_info, info_list, analysis_version);
		let rendered = move_explainer.renderExplanation(explanation, key => translate.t(key));
		let mode_key = "Selected";

		if (preview_move) {
			mode_key = "Preview";
		} else if (fixed_move) {
			mode_key = "Pinned";
		}

		let mode_label = translate.t(mode_key);
		let meta = `${rendered.rank_line} | ${rendered.eval_line}`;
		let expand_label = rightgridder.classList.contains("explainbox-expanded") ? translate.t("Normal size") : translate.t("Wider");
		let focus_label = translate.t("Pop-out window");
		let theme_html = rendered.themes.map(theme => `<div class="explainbox_item">- ${SafeStringHTML(theme)}</div>`).join("");
		let reply_html = "";
		let why_not_html = "";
		let coach_html = "";
		let coach_metrics_html = "";
		let quick_status_html = "";

		if (rendered.reply_summary || rendered.reply_theme || rendered.reply_note) {
			reply_html =
				(rendered.reply_summary ? `<div class="explainbox_item">${SafeStringHTML(rendered.reply_summary)}</div>` : "") +
				(rendered.reply_theme ? `<div class="explainbox_item">- ${SafeStringHTML(rendered.reply_theme)}</div>` : "") +
				(rendered.reply_note ? `<div class="explainbox_item">${SafeStringHTML(rendered.reply_note)}</div>` : "");
		}

		if (rendered.why_not_reasons && rendered.why_not_reasons.length > 0) {
			why_not_html =
				rendered.why_not_reasons.map(reason =>
					`<div class="explainbox_item"><span class="gray">${SafeStringHTML(reason.label)}:</span> ${SafeStringHTML(reason.text)}</div>`
				).join("");
		}

		if (rendered.coach_metrics && rendered.coach_metrics.length > 0) {
			coach_metrics_html = rendered.coach_metrics.map(metric =>
				`<div class="explainbox_item"><span class="gray">${SafeStringHTML(metric.label)}:</span> ${SafeStringHTML(metric.text)}</div>`
			).join("");
		}

		if (rendered.coach_notes && rendered.coach_notes.length > 0) {
			let coach_items = rendered.coach_notes.map(note => `<div class="explainbox_item">- ${SafeStringHTML(note)}</div>`).join("");
			coach_html =
				coach_metrics_html +
				coach_items;
		} else if (coach_metrics_html) {
			coach_html = coach_metrics_html;
		}

		if (hover_state && hover_state.move === selected_move) {
			if (hover_state.status === "pending") {
				quick_status_html = `<div class="explainbox_note gray">${SafeStringHTML(translate.t("Quick engine check pending..."))}</div>`;
			} else if (hover_state.status === "running") {
				quick_status_html = `<div class="explainbox_note gray">${SafeStringHTML(translate.t("Quick engine check running..."))}</div>`;
			}
		}

		let key_ideas_section = this.render_explainbox_section("key-ideas", rendered.key_ideas_label, theme_html);
		let main_idea_section = this.render_explainbox_section("main-idea", rendered.main_idea_label, `<div class="explainbox_item">${SafeStringHTML(rendered.pv_hint)}</div>`);
		let likely_reply_section = this.render_explainbox_section("likely-reply", rendered.reply_label, reply_html);
		let why_not_section = this.render_explainbox_section("why-not", rendered.why_not_label, why_not_html);
		let coach_section = this.render_explainbox_section("coach-view", rendered.coach_label, coach_html);
		let comparison_section = this.render_explainbox_section("comparison", rendered.comparison_label, `<div class="explainbox_item">${SafeStringHTML(rendered.comparison)}</div>`);
		let sections_html = key_ideas_section + main_idea_section + likely_reply_section + why_not_section + coach_section + comparison_section;
		let normal_actions_html =
			`<div class="explainbox_actions">` +
				`<span id="explainbox_expand_clicker" class="blue explainbox_action">${SafeStringHTML(expand_label)}</span>` +
				`<span id="explainbox_focus_clicker" class="blue explainbox_action">${SafeStringHTML(focus_label)}</span>` +
			`</div>`;

		if (panel_visible) {
			explainbox.innerHTML =
				`<div class="explainbox_card">` +
					`<div class="explainbox_topbar">` +
						`<div class="explainbox_header">` +
							`<span class="blue">${SafeStringHTML(rendered.title)}</span>` +
							`<span class="gray">${SafeStringHTML(mode_label)}</span>` +
						`</div>` +
						normal_actions_html +
						`<div class="explainbox_move"><span class="white">${SafeStringHTML(explanation.nice_move)}</span></div>` +
						`<div class="explainbox_meta gray">${SafeStringHTML(meta)}</div>` +
						quick_status_html +
					`</div>` +
					learning_html +
					`<div class="explainbox_summary">${SafeStringHTML(rendered.summary)}</div>` +
					sections_html +
				`</div>`;
		}

		this.set_explanation_popup_payload(
			`${rendered.title} - ${explanation.nice_move}`,
			`<div class="explainbox_card explainbox_card_popup">` +
				`<div class="explainbox_topbar">` +
					`<div class="explainbox_header">` +
						`<span class="blue">${SafeStringHTML(rendered.title)}</span>` +
						`<span class="gray">${SafeStringHTML(mode_label)}</span>` +
					`</div>` +
					`<div class="explainbox_move"><span class="white">${SafeStringHTML(explanation.nice_move)}</span></div>` +
					`<div class="explainbox_meta gray">${SafeStringHTML(meta)}</div>` +
					quick_status_html +
				`</div>` +
				learning_html +
				`<div class="explainbox_summary">${SafeStringHTML(rendered.summary)}</div>` +
				sections_html +
			`</div>`
		);
	},
};
