"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const explanation_translations = require("../src/modules/explanation_translations");
const move_explainer = require("../src/modules/move_explainer");

function New2DArray(x, y, value) {
	let ret = [];
	for (let i = 0; i < x; i++) {
		ret.push([]);
		for (let j = 0; j < y; j++) {
			ret[i].push(value);
		}
	}
	return ret;
}

function S(x, y) {
	return String.fromCharCode(97 + x) + (8 - y).toString();
}

function XY(s) {
	if (typeof s !== "string" || s.length !== 2) {
		return [-1, -1];
	}
	return [s.charCodeAt(0) - 97, 56 - s.charCodeAt(1)];
}

function Sign(n) {
	return n > 0 ? 1 : (n < 0 ? -1 : 0);
}

function NumbersBetween(a, b) {
	let ret = [];
	for (let n = a; n !== b; n += Sign(b - a)) {
		ret.push(n);
	}
	ret.push(b);
	return ret;
}

function ReplaceAll(s, search, replace) {
	return s.split(search).join(replace);
}

global.New2DArray = New2DArray;
global.S = S;
global.XY = XY;
global.Sign = Sign;
global.NumbersBetween = NumbersBetween;
global.ReplaceAll = ReplaceAll;

for (let relative of [
	"../src/renderer/30_point.js",
	"../src/renderer/31_sliders.js",
	"../src/renderer/40_position.js",
	"../src/renderer/41_fen.js",
]) {
	let absolute = path.join(__dirname, relative);
	vm.runInThisContext(fs.readFileSync(absolute, "utf8"), {filename: absolute});
}

function make_info(move, pv, cp, mate = 0) {
	return {
		move,
		pv,
		cp,
		mate,
		__touched: true
	};
}

function make_unsearched_info(move) {
	return {
		move,
		pv: [move],
		cp: 0,
		mate: 0,
		__touched: false
	};
}

let cases = [
	{
		name: "development",
		fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		nodeMove: null,
		info: make_info("g1f3", ["g1f3", "g8f6", "d2d4"], 32),
		best: make_info("g1f3", ["g1f3", "g8f6", "d2d4"], 32),
		second: make_info("e2e4", ["e2e4", "e7e5", "g1f3"], 24),
		expected_tags: ["development"],
		expected_learning_status: "Acceptable",
		min_coach_notes: 1,
		min_why_not: 1,
		expects_reply: true
	},
	{
		name: "center",
		fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		nodeMove: null,
		info: make_info("e2e4", ["e2e4", "e7e5", "g1f3"], 28),
		best: make_info("e2e4", ["e2e4", "e7e5", "g1f3"], 28),
		second: make_info("d2d4", ["d2d4", "d7d5", "g1f3"], 24),
		expected_tags: ["center_pawn"],
		expects_reply: true
	},
	{
		name: "check",
		fen: "4k3/8/8/8/8/8/2Q5/4K3 w - - 0 1",
		nodeMove: null,
		info: make_info("c2c8", ["c2c8", "e8e7", "c8e6"], 210),
		best: make_info("c2c8", ["c2c8", "e8e7", "c8e6"], 210),
		second: make_info("c2h7", ["c2h7", "e8d8", "h7g8"], 140),
		expected_tags: ["check"]
	},
	{
		name: "castling",
		fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
		nodeMove: null,
		info: make_info("e1h1", ["e1h1", "e8h8", "f1f2"], 40),
		best: make_info("e1h1", ["e1h1", "e8h8", "f1f2"], 40),
		second: make_info("e1a1", ["e1a1", "e8a8", "d1d2"], 35),
		expected_tags: ["castle"]
	},
	{
		name: "promotion",
		fen: "2k5/4P3/8/8/8/8/8/4K3 w - - 0 1",
		nodeMove: null,
		info: make_info("e7e8q", ["e7e8q", "c8c7", "e8e7"], 900),
		best: make_info("e7e8q", ["e7e8q", "c8c7", "e8e7"], 900),
		second: make_info("e7e8n", ["e7e8n", "c8d7", "e1d2"], 250),
		expected_tags: ["promotion"]
	},
	{
		name: "defense",
		fen: "4r1k1/8/8/8/8/8/5PPP/4K3 w - - 0 1",
		nodeMove: null,
		info: make_info("e1d2", ["e1d2", "e8d8", "d2c3"], -180),
		best: make_info("e1d2", ["e1d2", "e8d8", "d2c3"], -180),
		second: make_info("e1f1", ["e1f1", "e8d8", "f1e2"], -260),
		expected_tags: ["defense"]
	},
	{
		name: "save_piece",
		fen: "4k3/8/8/8/4r3/8/4N3/6K1 w - - 0 1",
		nodeMove: null,
		info: make_info("e2g3", ["e2g3", "e8d7", "g3e4"], 18),
		best: make_info("e2g3", ["e2g3", "e8d7", "g3e4"], 18),
		second: make_info("e2c3", ["e2c3", "e8d7", "c3e4"], -12),
		expected_tags: ["save_piece", "threat"]
	},
	{
		name: "king_activity",
		fen: "8/8/8/8/8/8/4K3/6k1 w - - 0 1",
		nodeMove: null,
		info: make_info("e2d3", ["e2d3", "g1f1", "d3e4"], 36),
		best: make_info("e2d3", ["e2d3", "g1f1", "d3e4"], 36),
		second: make_info("e2f3", ["e2f3", "g1h1", "f3e4"], 28),
		expected_tags: ["king_activity"]
	},
	{
		name: "unsearched_preview",
		fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		nodeMove: null,
		info: make_unsearched_info("a2a3"),
		best: make_info("g1f3", ["g1f3", "g8f6", "d2d4"], 32),
		second: make_info("e2e4", ["e2e4", "e7e5", "g1f3"], 24),
		expected_tags: ["slow_pawn"],
		expected_learning_status: "Dubious",
		min_why_not: 2
	},
	{
		name: "bad_king_opening",
		fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
		nodeMove: null,
		info: make_unsearched_info("e1e2"),
		best: make_info("g1f3", ["g1f3", "b8c6", "f1c4"], 36),
		second: make_info("b1c3", ["b1c3", "g8f6", "g1f3"], 28),
		expected_tags: ["early_king"],
		expected_learning_status: "Clear concession",
		min_coach_notes: 1,
		min_why_not: 2
	},
	{
		name: "bad_king_touched",
		fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
		nodeMove: null,
		info: make_info("e1e2", ["e1e2", "b8c6", "g1f3", "g8f6"], -136),
		best: make_info("g1f3", ["g1f3", "b8c6", "f1c4", "g8f6"], 36),
		second: make_info("b1c3", ["b1c3", "g8f6", "g1f3"], 28),
		expected_tags: ["early_king"],
		expected_learning_status: "Clear concession",
		min_coach_notes: 1,
		min_why_not: 3,
		expects_reply: true
	},
	{
		name: "pawn_structure",
		fen: "rnbqkbnr/pppppppp/8/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 1",
		nodeMove: null,
		info: make_info("c2c3", ["c2c3", "g8f6", "f1d3"], 26),
		best: make_info("c2c3", ["c2c3", "g8f6", "f1d3"], 26),
		second: make_info("g1f3", ["g1f3", "g8f6", "f1d3"], 18),
		expected_tags: ["pawn_structure"],
		min_coach_notes: 1,
		min_why_not: 1
	},
	{
		name: "outpost_knight",
		fen: "r1bqkbnr/pp3ppp/8/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 1",
		nodeMove: null,
		info: make_info("c3d5", ["c3d5", "g8f6", "d5f6"], 52),
		best: make_info("c3d5", ["c3d5", "g8f6", "d5f6"], 52),
		second: make_info("g1f3", ["g1f3", "g8f6", "f1d3"], 28),
		expected_tags: ["outpost"],
		min_coach_notes: 1,
		min_why_not: 1,
		expects_reply: true
	},
	{
		name: "bishop_quality",
		fen: "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1",
		nodeMove: null,
		info: make_info("e2e3", ["e2e3", "g8f6", "f1d3"], 22),
		best: make_info("e2e3", ["e2e3", "g8f6", "f1d3"], 22),
		second: make_info("g1f3", ["g1f3", "g8f6", "e2e3"], 16),
		min_coach_notes: 1,
		min_why_not: 1
	},
];

function assert_no_placeholders(s, label) {
	if (/\{[a-z_]+\}/i.test(s)) {
		throw new Error(`Unresolved placeholder in ${label}: ${s}`);
	}
}

function make_translate(language) {
	let table = explanation_translations[language] || Object.create(null);
	return function(key) {
		return table[key] || key;
	};
}

for (let language of ["English", "\u7b80\u4f53\u4e2d\u6587", "\u7e41\u9ad4\u4e2d\u6587"]) {
	let translate = make_translate(language);

	for (let sample of cases) {
		let node = {
			board: LoadFEN(sample.fen),
			move: sample.nodeMove
		};

		let info_list = [sample.best, sample.second, sample.info].filter(Boolean);
		let explanation = move_explainer.explainMove({
			node,
			info: sample.info,
			bestInfo: sample.best,
			secondInfo: sample.second,
			infoList: info_list
		});
		let rendered = move_explainer.renderExplanation(explanation, translate);

		for (let tag of sample.expected_tags || []) {
			if (!explanation.raw_tags.includes(tag)) {
				throw new Error(`Missing expected tag ${tag} for ${sample.name}`);
			}
		}

		for (let field of [rendered.title, rendered.rank_line, rendered.eval_line, rendered.summary, rendered.pv_hint, rendered.comparison]) {
			if (!field || !field.trim()) {
				throw new Error(`Empty rendered field for ${sample.name} in ${language}`);
			}
			assert_no_placeholders(field, `${sample.name}/${language}`);
		}

		for (let theme of rendered.themes) {
			if (!theme || !theme.trim()) {
				throw new Error(`Empty theme for ${sample.name} in ${language}`);
			}
			assert_no_placeholders(theme, `${sample.name}/${language}/theme`);
		}

		if (sample.min_coach_notes && (!rendered.coach_notes || rendered.coach_notes.length < sample.min_coach_notes)) {
			throw new Error(`Expected at least ${sample.min_coach_notes} coach notes for ${sample.name} in ${language}`);
		}

		for (let note of rendered.coach_notes || []) {
			if (!note || !note.trim()) {
				throw new Error(`Empty coach note for ${sample.name} in ${language}`);
			}
			assert_no_placeholders(note, `${sample.name}/${language}/coach`);
		}

		if (sample.best && sample.second && (!rendered.coach_metrics || rendered.coach_metrics.length < 5)) {
			throw new Error(`Expected a full coach scorecard for ${sample.name} in ${language}`);
		}

		if (sample.best && sample.second) {
			let metric_labels = new Set((rendered.coach_metrics || []).map(metric => metric.label));
			for (let label of ["Pawn structure", "Squares", "Minor pieces", "Endgame"].map(translate)) {
				if (!metric_labels.has(label)) {
					throw new Error(`Missing long-term metric ${label} for ${sample.name} in ${language}`);
				}
			}
		}

		for (let metric of rendered.coach_metrics || []) {
			if (!metric || !metric.label || !metric.text) {
				throw new Error(`Empty coach metric for ${sample.name} in ${language}`);
			}
			assert_no_placeholders(metric.label, `${sample.name}/${language}/metric-label`);
			assert_no_placeholders(metric.text, `${sample.name}/${language}/metric-text`);
		}

		if (sample.min_why_not && (!rendered.why_not_reasons || rendered.why_not_reasons.length < sample.min_why_not)) {
			throw new Error(`Expected at least ${sample.min_why_not} why-not reasons for ${sample.name} in ${language}`);
		}

		for (let reason of rendered.why_not_reasons || []) {
			if (!reason || !reason.label || !reason.text) {
				throw new Error(`Empty why-not reason for ${sample.name} in ${language}`);
			}
			assert_no_placeholders(reason.label, `${sample.name}/${language}/why-not-label`);
			assert_no_placeholders(reason.text, `${sample.name}/${language}/why-not-text`);
		}

		if (sample.expects_reply) {
			if (!rendered.reply_label || !rendered.reply_summary || !rendered.reply_note) {
				throw new Error(`Missing reply section for ${sample.name} in ${language}`);
			}
			assert_no_placeholders(rendered.reply_label, `${sample.name}/${language}/reply-label`);
			assert_no_placeholders(rendered.reply_summary, `${sample.name}/${language}/reply-summary`);
			assert_no_placeholders(rendered.reply_note, `${sample.name}/${language}/reply-note`);
			if (sample.best && sample.info && sample.best.move === sample.info.move && /still prefers your move|\u4ecd\u7136\u66f4\u559c\u6b22\u4f60\u7684\u8fd9\u624b|\u4ecd\u7136\u66f4\u559c\u6b61\u4f60\u7684\u9019\u624b/.test(rendered.reply_note)) {
				throw new Error(`Best line reply note should not use fallback comparison wording for ${sample.name} in ${language}`);
			}
			if (rendered.reply_theme) {
				assert_no_placeholders(rendered.reply_theme, `${sample.name}/${language}/reply-theme`);
			}
		}

		let learning = move_explainer.buildLearningFeedback({
			node,
			info: sample.info,
			bestInfo: sample.best,
			secondInfo: sample.second,
			infoList: info_list
		});
		let rendered_learning = move_explainer.renderLearningFeedback(learning, translate);

		for (let field of [rendered_learning.title, rendered_learning.move_label, rendered_learning.move, rendered_learning.status, rendered_learning.summary]) {
			if (!field || !field.trim()) {
				throw new Error(`Empty learning field for ${sample.name} in ${language}`);
			}
			assert_no_placeholders(field, `${sample.name}/${language}/learning`);
		}

		if (sample.expected_learning_status && rendered_learning.status !== translate(sample.expected_learning_status)) {
			throw new Error(`Unexpected learning status for ${sample.name} in ${language}: ${rendered_learning.status}`);
		}

		for (let field of [rendered_learning.issue_text, rendered_learning.better_text, rendered_learning.reply_text, rendered_learning.note_text]) {
			if (!field) {
				continue;
			}
			assert_no_placeholders(field, `${sample.name}/${language}/learning-detail`);
		}
	}
}

console.log("Move explainer smoke test passed.");
