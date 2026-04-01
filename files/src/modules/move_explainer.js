"use strict";

const piece_values = Object.freeze({
	p: 1,
	n: 3,
	b: 3,
	r: 5,
	q: 9,
	k: 100
});

const central_core = new Set(["d4", "e4", "d5", "e5"]);
const central_space = new Set(["c3", "d3", "e3", "f3", "c4", "d4", "e4", "f4", "c5", "d5", "e5", "f5", "c6", "d6", "e6", "f6"]);
const minor_home_squares = new Set(["b1", "g1", "c1", "f1", "b8", "g8", "c8", "f8"]);

function square_to_point(square) {
	if (typeof square !== "string" || square.length !== 2) {
		return null;
	}

	let file = square.charCodeAt(0) - 97;
	let rank = square.charCodeAt(1) - 49;

	if (file < 0 || file > 7 || rank < 0 || rank > 7) {
		return null;
	}

	return {
		x: file,
		y: 7 - rank,
		s: square
	};
}

function point_to_square(x, y) {
	return String.fromCharCode(97 + x) + (8 - y).toString();
}

function source_square(move) {
	return square_to_point(typeof move === "string" ? move.slice(0, 2) : "");
}

function destination_square(move) {
	return square_to_point(typeof move === "string" ? move.slice(2, 4) : "");
}

function in_bounds(x, y) {
	return x >= 0 && x < 8 && y >= 0 && y < 8;
}

function opposite_colour(colour) {
	return colour === "w" ? "b" : "w";
}

function piece_colour(piece) {
	if (!piece) {
		return "";
	}
	return piece === piece.toUpperCase() ? "w" : "b";
}

function piece_name(piece) {
	switch ((piece || "").toLowerCase()) {
	case "p": return "pawn";
	case "n": return "knight";
	case "b": return "bishop";
	case "r": return "rook";
	case "q": return "queen";
	case "k": return "king";
	default: return "piece";
	}
}

function piece_value(piece) {
	return piece_values[(piece || "").toLowerCase()] || 0;
}

function moved_piece(board, move) {
	return board.piece(source_square(move));
}

function is_castling_move(board, move) {
	let source = source_square(move);
	let dest = destination_square(move);
	let piece = board.piece(source);

	if (!source || !dest || !piece) {
		return false;
	}

	return ["K", "k"].includes(piece) && board.same_colour(source, dest);
}

function landing_square(board, move) {
	let source = source_square(move);
	let dest = destination_square(move);

	if (!source || !dest) {
		return dest;
	}

	if (is_castling_move(board, move)) {
		return {
			x: dest.x > source.x ? 6 : 2,
			y: source.y,
			s: point_to_square(dest.x > source.x ? 6 : 2, source.y)
		};
	}

	return dest;
}

function capture_info(board, move) {
	let source = source_square(move);
	let dest = destination_square(move);
	let piece = board.piece(source);

	if (!source || !dest || !piece || is_castling_move(board, move)) {
		return null;
	}

	let captured = board.piece(dest);

	if (captured) {
		return {
			piece: captured,
			square: dest.s
		};
	}

	if ((piece === "P" || piece === "p") && source.x !== dest.x) {
		return {
			piece: piece === "P" ? "p" : "P",
			square: point_to_square(dest.x, source.y)
		};
	}

	return null;
}

function score_value(info) {
	if (!info) {
		return 0;
	}

	if (typeof info.mate === "number" && info.mate !== 0) {
		if (info.mate > 0) {
			return 30000 - info.mate;
		}
		return -30000 - info.mate;
	}

	if (typeof info.cp === "number") {
		return info.cp;
	}

	if (typeof info.q === "number") {
		return Math.round(info.q * 1000);
	}

	return 0;
}

function format_eval_text(info) {
	if (!info || !info.__touched) {
		return {
			key: "?",
			args: null
		};
	}

	if (typeof info.mate === "number" && info.mate !== 0) {
		if (info.mate > 0) {
			return {
				key: "Mate in {n}",
				args: {n: info.mate.toString()}
			};
		}

		return {
			key: "Mated in {n}",
			args: {n: Math.abs(info.mate).toString()}
		};
	}

	let cp = typeof info.cp === "number" ? info.cp : 0;
	let pawns = (cp / 100).toFixed(2);

	if (cp > 0) {
		pawns = "+" + pawns;
	}

	return {
		key: pawns,
		args: null
	};
}

function format_delta_text(best_info, info) {
	if (!best_info || !info || !best_info.__touched || !info.__touched) {
		return "?";
	}

	if ((best_info.mate || 0) !== 0 || (info.mate || 0) !== 0) {
		if ((best_info.mate || 0) > 0 && (info.mate || 0) <= 0) {
			return "a forced mating attack";
		}
		if ((best_info.mate || 0) < 0 && (info.mate || 0) >= 0) {
			return "the line that avoids immediate mate";
		}
		return "the mating sequence";
	}

	return "{value} pawns";
}

function format_delta_args(best_info, info) {
	if (!best_info || !info || !best_info.__touched || !info.__touched) {
		return null;
	}

	if ((best_info.mate || 0) !== 0 || (info.mate || 0) !== 0) {
		return null;
	}

	let diff = Math.abs(score_value(best_info) - score_value(info)) / 100;
	return {delta: diff.toFixed(diff >= 1 ? 1 : 2)};
}

function nice_pv(board, info) {
	let ret = [];
	let temp = board;

	for (let move of Array.isArray(info.pv) ? info.pv : [info.move]) {
		ret.push(temp.nice_string(move));
		temp = temp.move(move);
	}

	return ret;
}

function non_pawn_material(board, colour = null) {
	let total = 0;

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			let piece = board.state[x][y];
			if (!piece || ["P", "p", "K", "k"].includes(piece)) {
				continue;
			}
			if (colour && piece_colour(piece) !== colour) {
				continue;
			}
			total += piece_value(piece);
		}
	}

	return total;
}

function is_endgame(board) {
	return non_pawn_material(board) <= 12;
}

function opening_phase(board) {
	return board.fullmove <= 10 && non_pawn_material(board) >= 40;
}

function has_castling_rights(board, colour) {
	let rights = colour === "w" ? ["A", "B", "C", "D", "E", "F", "G", "H"] : ["a", "b", "c", "d", "e", "f", "g", "h"];
	return rights.some(ch => board.castling.includes(ch));
}

function center_distance(point) {
	if (!point) {
		return 100;
	}
	return Math.abs(point.x - 3.5) + Math.abs(point.y - 3.5);
}

function is_development_move(board, move) {
	let piece = moved_piece(board, move);
	let source = source_square(move);
	let dest = landing_square(board, move);

	if (!source || !dest || !piece) {
		return false;
	}

	if (!["N", "n", "B", "b"].includes(piece)) {
		return false;
	}

	if (!minor_home_squares.has(source.s)) {
		return false;
	}

	return dest.s !== source.s;
}

function development_supports_castling(board, move) {
	if (!is_development_move(board, move)) {
		return false;
	}

	let colour = board.active;
	if (colour === "w") {
		return board.castling.includes("A") || board.castling.includes("H");
	}
	return board.castling.includes("a") || board.castling.includes("h");
}

function central_pawn_info(board, move) {
	let piece = moved_piece(board, move);
	let source = source_square(move);
	let dest = landing_square(board, move);

	if (!source || !dest || (piece !== "P" && piece !== "p")) {
		return null;
	}

	let is_capture = capture_info(board, move) !== null;
	if (is_capture) {
		return null;
	}

	if (central_core.has(dest.s)) {
		return {kind: "core"};
	}

	if (central_space.has(dest.s)) {
		return {kind: "space"};
	}

	return null;
}

function early_king_move_info(board, board_after, move) {
	let piece = moved_piece(board, move);

	if (!["K", "k"].includes(piece) || is_castling_move(board, move) || is_endgame(board) || !opening_phase(board)) {
		return null;
	}

	return {
		loses_castling: has_castling_rights(board, board.active) && !has_castling_rights(board_after, board.active)
	};
}

function early_queen_move_info(board, move) {
	let piece = moved_piece(board, move);
	let source = source_square(move);

	if (!source || !["Q", "q"].includes(piece) || !opening_phase(board)) {
		return null;
	}

	if ((piece === "Q" && source.s === "d1") || (piece === "q" && source.s === "d8")) {
		return {source: source.s};
	}

	return null;
}

function slow_opening_move_info(board, move, capture, threat, central_pawn) {
	let piece = moved_piece(board, move);
	let dest = landing_square(board, move);

	if (!piece || !dest || !opening_phase(board) || capture || threat || central_pawn || is_castling_move(board, move) || is_development_move(board, move)) {
		return null;
	}

	if (piece === "P" || piece === "p") {
		if (["a", "b", "g", "h"].includes(dest.s[0])) {
			return {file: dest.s[0]};
		}
	}

	return null;
}

function rook_file_state(board_after, move) {
	let target = destination_square(move);
	let piece = board_after.piece(target);

	if (!target || (piece !== "R" && piece !== "r")) {
		return null;
	}

	let own_pawns = 0;
	let enemy_pawns = 0;
	let rook_colour = board_after.colour(target);

	for (let y = 0; y < 8; y++) {
		let current = board_after.state[target.x][y];
		if (current === "") {
			continue;
		}
		if (current === "P" || current === "p") {
			if (piece_colour(current) === rook_colour) {
				own_pawns++;
			} else {
				enemy_pawns++;
			}
		}
	}

	if (own_pawns === 0 && enemy_pawns === 0) {
		return "open";
	}
	if (own_pawns === 0 && enemy_pawns > 0) {
		return "half-open";
	}
	return null;
}

function is_passed_pawn(board_after, move) {
	let target = destination_square(move);
	let piece = board_after.piece(target);

	if (!target || (piece !== "P" && piece !== "p")) {
		return false;
	}

	let enemy_pawn = piece === "P" ? "p" : "P";
	let step = piece === "P" ? -1 : 1;

	for (let dx = -1; dx <= 1; dx++) {
		let x = target.x + dx;
		if (!in_bounds(x, target.y)) {
			continue;
		}

		for (let y = target.y + step; in_bounds(x, y); y += step) {
			if (board_after.state[x][y] === enemy_pawn) {
				return false;
			}
		}
	}

	return true;
}

function king_checked_after(board_after, mover_colour) {
	let king_char = mover_colour === "w" ? "k" : "K";
	let king_square = board_after.find(king_char)[0];

	if (!king_square) {
		return false;
	}

	return board_after.attacked(king_square, board_after.colour(king_square));
}

function fresh_attack_target(board, board_after) {
	let mover_colour = board.active;
	let enemy_colour = opposite_colour(mover_colour);
	let enemy_king = mover_colour === "w" ? "k" : "K";
	let best = null;

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			let piece = board_after.state[x][y];
			let square = {x, y, s: point_to_square(x, y)};

			if (!piece || piece === enemy_king || board_after.colour(square) !== enemy_colour) {
				continue;
			}

			let attacked_before = board.attacked(square, enemy_colour);
			let attacked_after = board_after.attacked(square, enemy_colour);

			if (!attacked_after || attacked_before) {
				continue;
			}

			let defended_after = board_after.attacked(square, mover_colour);
			let score = piece_value(piece) * 10 + (defended_after ? 0 : 3);

			if (!best || score > best.score) {
				best = {
					piece,
					square: square.s,
					undefended: !defended_after,
					score
				};
			}
		}
	}

	return best;
}

function save_piece_info(board, board_after, move) {
	let source = source_square(move);
	let dest = landing_square(board, move);
	let piece = board.piece(source);

	if (!source || !dest || !piece || ["K", "k"].includes(piece)) {
		return null;
	}

	let mover_colour = board.active;
	let enemy_colour = opposite_colour(mover_colour);
	let source_attacked = board.attacked(source, mover_colour);
	let dest_attacked = board_after.attacked(dest, mover_colour);
	let dest_defended = board_after.attacked(dest, enemy_colour);

	if (!source_attacked) {
		return null;
	}

	if (!dest_attacked || dest_defended) {
		return {
			piece,
			destination: dest.s
		};
	}

	return null;
}

function king_activity_info(board, move) {
	let source = source_square(move);
	let dest = landing_square(board, move);
	let piece = moved_piece(board, move);

	if (!source || !dest || !["K", "k"].includes(piece) || !is_endgame(board)) {
		return null;
	}

	if (center_distance(dest) < center_distance(source)) {
		return {
			source: source.s,
			destination: dest.s
		};
	}

	return null;
}

function simplifies_ahead(best_value, capture) {
	return !!capture && best_value >= 120 && piece_value(capture.piece) >= 3;
}

function is_recapture(node, capture) {
	return !!capture && !!node && typeof node.move === "string" && capture.square === node.move.slice(2, 4);
}

function attacks_square(board, colour, square) {
	let point = typeof square === "string" ? square_to_point(square) : square;
	if (!point) {
		return false;
	}
	return board.attacked(point, opposite_colour(colour));
}

function material_balance(board, colour) {
	let own = 0;
	let enemy = 0;

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			let piece = board.state[x][y];
			if (!piece || ["K", "k"].includes(piece)) {
				continue;
			}

			if (piece_colour(piece) === colour) {
				own += piece_value(piece);
			} else {
				enemy += piece_value(piece);
			}
		}
	}

	return own - enemy;
}

function developed_minor_count(board, colour) {
	let pieces = colour === "w" ? ["N", "B"] : ["n", "b"];
	let home = colour === "w" ? new Set(["b1", "g1", "c1", "f1"]) : new Set(["b8", "g8", "c8", "f8"]);
	let count = 0;

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			let piece = board.state[x][y];
			let square = point_to_square(x, y);
			if (!pieces.includes(piece)) {
				continue;
			}
			if (!home.has(square)) {
				count++;
			}
		}
	}

	return count;
}

function king_square(board, colour) {
	let king_char = colour === "w" ? "K" : "k";
	return board.find(king_char)[0] || null;
}

function is_castled(board, colour) {
	let square = king_square(board, colour);
	if (!square) {
		return false;
	}
	if (colour === "w") {
		return square.s === "g1" || square.s === "c1";
	}
	return square.s === "g8" || square.s === "c8";
}

function king_safety_score(board, colour) {
	if (is_endgame(board)) {
		return 0;
	}

	let square = king_square(board, colour);
	if (!square) {
		return 0;
	}

	let score = 0;

	if (is_castled(board, colour)) {
		score += 3;
	}

	if (has_castling_rights(board, colour)) {
		score += 1;
	}

	if ((colour === "w" && square.y === 7) || (colour === "b" && square.y === 0)) {
		score += 1;
	}

	let dist = center_distance(square);
	if (dist <= 2.5) {
		score -= 2;
	} else if (dist <= 3.5) {
		score -= 1;
	}

	return score;
}

function center_control_score(board, colour) {
	let score = 0;

	for (let square of central_core) {
		let point = square_to_point(square);
		if (board.colour(point) === colour) {
			score += 2;
		}
		if (attacks_square(board, colour, point)) {
			score += 1;
		}
	}

	return score;
}

function space_score(board, colour) {
	let score = 0;

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			let piece = board.state[x][y];
			let square = point_to_square(x, y);

			if (!piece || piece_colour(piece) !== colour) {
				continue;
			}

			let lower = piece.toLowerCase();
			let advanced = (colour === "w" && y <= 3) || (colour === "b" && y >= 4);

			if (lower === "p") {
				if (advanced) {
					score += 1;
				}
				if (central_space.has(square)) {
					score += 1;
				}
				continue;
			}

			if (central_space.has(square)) {
				score += 1;
			}
		}
	}

	return score;
}

function total_material(board) {
	let total = 0;

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			let piece = board.state[x][y];
			if (!piece || piece === "K" || piece === "k") {
				continue;
			}

			total += piece_value(piece);
		}
	}

	return total;
}

function piece_points(board, colour, pieces) {
	let ret = [];

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			let piece = board.state[x][y];
			if (!piece || piece_colour(piece) !== colour || !pieces.includes(piece)) {
				continue;
			}

			ret.push({x, y, s: point_to_square(x, y)});
		}
	}

	return ret;
}

function pawn_points(board, colour) {
	return piece_points(board, colour, colour === "w" ? ["P"] : ["p"]);
}

function square_colour_index(point) {
	return (point.x + point.y) % 2;
}

function pawn_attacks_square(board, colour, square) {
	let point = typeof square === "string" ? square_to_point(square) : square;

	if (!point) {
		return false;
	}

	let pawn = colour === "w" ? "P" : "p";
	let source_y = colour === "w" ? point.y + 1 : point.y - 1;

	for (let dx of [-1, 1]) {
		let source_x = point.x + dx;

		if (!in_bounds(source_x, source_y)) {
			continue;
		}

		if (board.state[source_x][source_y] === pawn) {
			return true;
		}
	}

	return false;
}

function enemy_pawn_can_challenge_square(board, colour, square) {
	let point = typeof square === "string" ? square_to_point(square) : square;

	if (!point) {
		return false;
	}

	let enemy = opposite_colour(colour);
	let enemy_pawn = enemy === "w" ? "P" : "p";

	for (let dx of [-1, 1]) {
		let file = point.x + dx;

		if (file < 0 || file > 7) {
			continue;
		}

		for (let y = 0; y < 8; y++) {
			if (board.state[file][y] !== enemy_pawn) {
				continue;
			}

			if ((enemy === "w" && y > point.y) || (enemy === "b" && y < point.y)) {
				return true;
			}
		}
	}

	return false;
}

function is_enemy_half_square(square, colour) {
	return colour === "w" ? square.y <= 3 : square.y >= 4;
}

function is_passed_pawn_at(board, square, colour) {
	let point = typeof square === "string" ? square_to_point(square) : square;

	if (!point) {
		return false;
	}

	let enemy_pawn = colour === "w" ? "p" : "P";

	for (let x = Math.max(0, point.x - 1); x <= Math.min(7, point.x + 1); x++) {
		for (let y = 0; y < 8; y++) {
			if (board.state[x][y] !== enemy_pawn) {
				continue;
			}

			if ((colour === "w" && y <= point.y) || (colour === "b" && y >= point.y)) {
				return false;
			}
		}
	}

	return true;
}

function is_backward_pawn(board, square, colour, pawns) {
	let point = typeof square === "string" ? square_to_point(square) : square;

	if (!point) {
		return false;
	}

	let step = colour === "w" ? -1 : 1;
	let front = {x: point.x, y: point.y + step, s: point_to_square(point.x, point.y + step)};

	if (!in_bounds(front.x, front.y)) {
		return false;
	}

	let has_adjacent_pawn_same_or_behind = pawns.some(other =>
		Math.abs(other.x - point.x) === 1 &&
		(colour === "w" ? other.y >= point.y : other.y <= point.y)
	);
	let has_adjacent_pawn_ahead = pawns.some(other =>
		Math.abs(other.x - point.x) === 1 &&
		(colour === "w" ? other.y < point.y : other.y > point.y)
	);

	if (has_adjacent_pawn_same_or_behind || !has_adjacent_pawn_ahead) {
		return false;
	}

	return pawn_attacks_square(board, opposite_colour(colour), front);
}

function pawn_structure_components(board, colour) {
	let pawns = pawn_points(board, colour);
	let files = new Array(8).fill(0);
	let isolated = 0;
	let doubled = 0;
	let backward = 0;
	let chain = 0;
	let passed = 0;
	let weak_set = new Set();

	for (let pawn of pawns) {
		files[pawn.x]++;
	}

	for (let count of files) {
		if (count > 1) {
			doubled += count - 1;
		}
	}

	for (let pawn of pawns) {
		let has_adjacent_file_pawn = pawns.some(other => Math.abs(other.x - pawn.x) === 1);
		let supported = pawn_attacks_square(board, colour, pawn);

		if (!has_adjacent_file_pawn) {
			isolated++;
			weak_set.add(pawn.s);
		}

		if (supported) {
			chain++;
		}

		if (is_passed_pawn_at(board, pawn, colour)) {
			passed++;
		}

		if (is_backward_pawn(board, pawn, colour, pawns)) {
			backward++;
			weak_set.add(pawn.s);
		}

		if (is_enemy_half_square(pawn, colour) && !supported) {
			weak_set.add(pawn.s);
		}
	}

	let weak = weak_set.size;
	let score = chain * 0.4 + passed * 0.8 - isolated * 0.9 - doubled * 0.8 - backward * 0.6 - weak * 0.35;

	return {
		score,
		isolated,
		doubled,
		backward,
		chain,
		weak,
		passed
	};
}

function knight_outpost_components(board, colour) {
	let knights = piece_points(board, colour, colour === "w" ? ["N"] : ["n"]);
	let score = 0;
	let outpost_score = 0;
	let strong = 0;
	let weak = 0;
	let best_outpost = null;
	let best_outpost_score = -1000;

	for (let knight of knights) {
		let on_rim = knight.x === 0 || knight.x === 7;
		let supported = pawn_attacks_square(board, colour, knight);
		let outpost = is_enemy_half_square(knight, colour) && supported && !enemy_pawn_can_challenge_square(board, colour, knight);
		let one = 0;

		if (central_space.has(knight.s)) {
			one += 1;
		}
		if (is_enemy_half_square(knight, colour)) {
			one += 0.5;
		}
		if (supported) {
			one += 0.4;
		}
		if (outpost) {
			one += 1.5;
			outpost_score += 2;
			strong++;
			if (one > best_outpost_score) {
				best_outpost_score = one;
				best_outpost = knight.s;
			}
		}
		if (on_rim) {
			one -= 1;
			weak++;
		}

		score += one;
	}

	return {
		score,
		outpost_score,
		strong,
		weak,
		best_outpost
	};
}

function bishop_mobility(board, square) {
	let point = typeof square === "string" ? square_to_point(square) : square;

	if (!point) {
		return 0;
	}

	let colour = board.colour(point);
	let total = 0;

	for (let [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
		for (let x = point.x + dx, y = point.y + dy; in_bounds(x, y); x += dx, y += dy) {
			let piece = board.state[x][y];

			if (piece === "") {
				total++;
				continue;
			}

			if (piece_colour(piece) !== colour) {
				total++;
			}
			break;
		}
	}

	return total;
}

function bishop_quality_components(board, colour) {
	let bishops = piece_points(board, colour, colour === "w" ? ["B"] : ["b"]);
	let pawns = pawn_points(board, colour);
	let score = 0;
	let good = 0;
	let bad = 0;

	for (let bishop of bishops) {
		let same_colour_pawns = pawns.filter(pawn => square_colour_index(pawn) === square_colour_index(bishop)).length;
		let opposite_colour_pawns = pawns.length - same_colour_pawns;
		let mobility = bishop_mobility(board, bishop);
		let one = mobility * 0.18 + (opposite_colour_pawns - same_colour_pawns) * 0.3;

		if (mobility >= 6 && same_colour_pawns <= opposite_colour_pawns) {
			one += 0.5;
			good++;
		}

		if (same_colour_pawns >= opposite_colour_pawns + 2 && mobility <= 4) {
			one -= 0.7;
			bad++;
		}

		score += one;
	}

	return {
		score,
		good,
		bad
	};
}

function endgame_comfort_components(board, colour, pawn_structure, bishop_quality, knight_quality) {
	let king = king_square(board, colour);
	let king_activity = king ? Math.max(0, 4 - center_distance(king)) : 0;
	let score =
		pawn_structure.score +
		pawn_structure.passed * 0.7 +
		bishop_quality.score * 0.35 +
		knight_quality.score * 0.25 +
		(is_endgame(board) ? king_activity * 0.8 : king_activity * 0.25);

	return {
		score,
		king_activity
	};
}

function strategic_profile(board, colour) {
	let pawn_structure = pawn_structure_components(board, colour);
	let knight = knight_outpost_components(board, colour);
	let bishop = bishop_quality_components(board, colour);
	let endgame = endgame_comfort_components(board, colour, pawn_structure, bishop, knight);

	return {
		pawn_structure,
		knight,
		bishop,
		endgame,
		minor_pieces: bishop.score + knight.score
	};
}

function board_with_active(board, colour) {
	let ret = board.copy();
	ret.active = colour;
	return ret;
}

function legal_moves_from(board, colour, source_square_text) {
	if (!source_square_text) {
		return [];
	}

	return board_with_active(board, colour).movegen().filter(move => move.slice(0, 2) === source_square_text);
}

function slider_directions(piece) {
	switch ((piece || "").toLowerCase()) {
	case "b":
		return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
	case "r":
		return [[1, 0], [-1, 0], [0, 1], [0, -1]];
	case "q":
		return [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
	default:
		return [];
	}
}

function first_piece_on_ray(board, start, dx, dy) {
	for (let x = start.x + dx, y = start.y + dy; in_bounds(x, y); x += dx, y += dy) {
		let piece = board.state[x][y];

		if (!piece) {
			continue;
		}

		return {
			piece,
			x,
			y,
			s: point_to_square(x, y)
		};
	}

	return null;
}

function line_direction(from, to) {
	if (!from || !to) {
		return null;
	}

	let dx = to.x - from.x;
	let dy = to.y - from.y;

	if (dx === 0 && dy === 0) {
		return null;
	}

	if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) {
		return null;
	}

	return [Math.sign(dx), Math.sign(dy)];
}

function piece_controls_square(board, source, target) {
	if (!source || !target) {
		return false;
	}

	let piece = board.piece(source);
	if (!piece) {
		return false;
	}

	let lower = piece.toLowerCase();
	let dx = target.x - source.x;
	let dy = target.y - source.y;

	switch (lower) {
	case "p": {
		let dir = piece === "P" ? -1 : 1;
		return dy === dir && Math.abs(dx) === 1;
	}
	case "n":
		return (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
	case "k":
		return Math.max(Math.abs(dx), Math.abs(dy)) === 1;
	case "b":
	case "r":
	case "q": {
		let direction = line_direction(source, target);
		if (!direction) {
			return false;
		}

		let [step_x, step_y] = direction;
		let diagonal = step_x !== 0 && step_y !== 0;
		let straight = step_x === 0 || step_y === 0;

		if ((lower === "b" && !diagonal) || (lower === "r" && !straight)) {
			return false;
		}

		for (let x = source.x + step_x, y = source.y + step_y; x !== target.x || y !== target.y; x += step_x, y += step_y) {
			if (board.state[x][y] !== "") {
				return false;
			}
		}

		return true;
	}
	default:
		return false;
	}
}

function same_line_points(a, b, c) {
	let abx = b.x - a.x;
	let aby = b.y - a.y;
	let acx = c.x - a.x;
	let acy = c.y - a.y;
	return abx * acy === aby * acx;
}

function legal_escape_count(board, colour, source_square_text) {
	let moves = legal_moves_from(board, colour, source_square_text);
	return moves.length;
}

function tactical_motifs(board, board_after, move) {
	let source = source_square(move);
	let landing = landing_square(board, move);
	let mover = board.active;
	let enemy = opposite_colour(mover);
	let moved = moved_piece(board, move);

	if (!source || !landing || !moved) {
		return [];
	}

	let motifs = [];
	let seen = new Set();
	let add_motif = (tag, key, args, score, motif_key) => {
		if (seen.has(tag)) {
			return;
		}
		seen.add(tag);
		motifs.push({tag, key, args: args || null, score, motif_key});
	};
	let active_board = board_with_active(board_after, mover);
	let attack_moves = active_board.movegen().filter(candidate => candidate.slice(0, 2) === landing.s);
	let attacked_targets = attack_moves.map(candidate => {
		let target = destination_square(candidate);
		let piece = board_after.piece(target);
		return piece ? {
			move: candidate,
			piece,
			square: target.s,
			value: piece_value(piece)
		} : null;
	}).filter(Boolean).sort((a, b) => b.value - a.value);
	let non_king_targets = attacked_targets.filter(target => target.piece.toLowerCase() !== "k");
	let enemy_king = king_square(board_after, enemy);
	let king_attacked = enemy_king ? piece_controls_square(board_after, landing, enemy_king) : false;

	if ((king_attacked && non_king_targets.length >= 1) || non_king_targets.length >= 2) {
		if (king_attacked && non_king_targets.length >= 1) {
			add_motif("fork", "It creates a fork: the king and {piece} are both under immediate pressure.", {
				piece: piece_name(non_king_targets[0].piece)
			}, 4.5, "fork");
		} else if (non_king_targets.length >= 2 && non_king_targets[0].value + non_king_targets[1].value >= 6) {
			add_motif("fork", "It creates a double attack on the {piece1} and {piece2}, so the opponent may not be able to cover both.", {
				piece1: piece_name(non_king_targets[0].piece),
				piece2: piece_name(non_king_targets[1].piece)
			}, 4.0, "fork");
		}
	}

	for (let [dx, dy] of slider_directions(moved)) {
		let first = null;
		let second = null;

		for (let x = landing.x + dx, y = landing.y + dy; in_bounds(x, y); x += dx, y += dy) {
			let piece = board_after.state[x][y];

			if (!piece) {
				continue;
			}

			if (piece_colour(piece) === mover) {
				break;
			}

			if (!first) {
				first = {piece, square: point_to_square(x, y)};
				continue;
			}

			second = {piece, square: point_to_square(x, y)};
			break;
		}

		if (!first || !second || piece_colour(second.piece) === mover) {
			continue;
		}

		if (second.piece.toLowerCase() === "k") {
			add_motif("pin", "It pins the {piece} to the king, so that piece cannot move freely.", {
				piece: piece_name(first.piece)
			}, 3.8, "pin");
		} else if (piece_value(second.piece) > piece_value(first.piece)) {
			add_motif("skewer", "It sets up a skewer: the {front} is exposed, and the {back} sits behind it.", {
				front: piece_name(first.piece),
				back: piece_name(second.piece)
			}, 3.4, "skewer");
		}
	}

	for (let [dx, dy] of [
		[1, 0], [-1, 0], [0, 1], [0, -1],
		[1, 1], [1, -1], [-1, 1], [-1, -1]
	]) {
		let friendly_slider = first_piece_on_ray(board, source, -dx, -dy);
		let target_piece = first_piece_on_ray(board, source, dx, dy);

		if (!friendly_slider || !target_piece) {
			continue;
		}

		if (piece_colour(friendly_slider.piece) !== mover || piece_colour(target_piece.piece) !== enemy) {
			continue;
		}

		if (!slider_directions(friendly_slider.piece).some(([sx, sy]) => sx === dx && sy === dy)) {
			continue;
		}

		let slider_point = square_to_point(friendly_slider.s);
		let target_point = square_to_point(target_piece.s);

		if (!piece_controls_square(board_after, slider_point, target_point)) {
			continue;
		}

		if (landing.s !== source.s && same_line_points(slider_point, source, landing) && same_line_points(slider_point, source, target_point)) {
			continue;
		}

		if (target_piece.piece.toLowerCase() === "k" || piece_value(target_piece.piece) >= 3) {
			add_motif("discovered_attack", "It uncovers a discovered attack, bringing another piece into the game at once.", null, 3.2, "discovered attack");
		}
	}

	let enemy_active_board = board_with_active(board_after, enemy);
	let enemy_king_moves = enemy_king ? enemy_active_board.movegen().filter(candidate => candidate.slice(0, 2) === enemy_king.s) : [];

	if (enemy_king && enemy_king_moves.length <= 1 && (moved === "R" || moved === "r" || moved === "Q" || moved === "q") && king_attacked) {
		let back_rank = (enemy === "w" && enemy_king.y === 7) || (enemy === "b" && enemy_king.y === 0);
		if (back_rank) {
			add_motif("back_rank", "It leans on the back rank, where the king has very little room.", null, 3.6, "back-rank pressure");
		}
	}

	for (let target of attacked_targets) {
		if (target.value < 3) {
			continue;
		}

		let escapes = legal_escape_count(board_after, enemy, target.square);

		if (escapes <= 1) {
			add_motif("trapped_piece", "It makes the {piece} awkwardly placed, with very few safe squares left.", {
				piece: piece_name(target.piece)
			}, 2.8, "piece trap");
			break;
		}
	}

	return motifs.sort((a, b) => b.score - a.score);
}

function file_counts_for_pawns(board, colour) {
	let counts = new Array(8).fill(0);

	for (let pawn of pawn_points(board, colour)) {
		counts[pawn.x]++;
	}

	return counts;
}

function has_pawn_on(board, colour, square_text) {
	let point = square_to_point(square_text);
	let pawn = colour === "w" ? "P" : "p";
	return !!point && board.state[point.x][point.y] === pawn;
}

function detect_iqp(board, colour, counts) {
	for (let file of [3, 4]) {
		if (counts[file] !== 1) {
			continue;
		}

		let left = file > 0 ? counts[file - 1] : 0;
		let right = file < 7 ? counts[file + 1] : 0;

		if (left === 0 && right === 0) {
			return true;
		}
	}

	return false;
}

function detect_hanging_pawns(board, colour) {
	let pairs = [[2, 3, 1, 4], [3, 4, 2, 5]];

	for (let [file1, file2, outer_left, outer_right] of pairs) {
		let counts = file_counts_for_pawns(board, colour);
		if (counts[file1] >= 1 && counts[file2] >= 1 && counts[outer_left] === 0 && counts[outer_right] === 0) {
			return true;
		}
	}

	return false;
}

function carlsbad_minority_side(board) {
	if (has_pawn_on(board, "w", "d4") && has_pawn_on(board, "b", "d5") && !has_pawn_on(board, "w", "c4") && has_pawn_on(board, "b", "c6")) {
		return "w";
	}
	if (has_pawn_on(board, "b", "d5") && has_pawn_on(board, "w", "d4") && !has_pawn_on(board, "b", "c5") && has_pawn_on(board, "w", "c3")) {
		return "b";
	}
	return "";
}

function detect_closed_center(board) {
	let locked_e = has_pawn_on(board, "w", "e4") && has_pawn_on(board, "b", "e5");
	let locked_d = has_pawn_on(board, "w", "d4") && has_pawn_on(board, "b", "d5");
	let crossed = (has_pawn_on(board, "w", "d5") && has_pawn_on(board, "b", "e6")) || (has_pawn_on(board, "b", "d4") && has_pawn_on(board, "w", "e3"));
	return (locked_d && locked_e) || crossed;
}

function detect_benoni(board, colour) {
	if (colour === "w") {
		return has_pawn_on(board, "w", "d5") && has_pawn_on(board, "b", "c5") && has_pawn_on(board, "b", "e6");
	}
	return has_pawn_on(board, "b", "d4") && has_pawn_on(board, "w", "c4") && has_pawn_on(board, "w", "e3");
}

function detect_colour_complex(board, colour, bishop_profile) {
	let pawns = pawn_points(board, colour);
	if (pawns.length < 4) {
		return false;
	}

	let dark = pawns.filter(pawn => square_colour_index(pawn) === 1).length;
	let light = pawns.length - dark;
	let majority = Math.max(dark, light);

	return majority >= pawns.length - 1 && bishop_profile.bad > bishop_profile.good;
}

function structure_state(board, colour, strategic) {
	let counts = file_counts_for_pawns(board, colour);

	if (carlsbad_minority_side(board) === colour) {
		return {name: "carlsbad", plan: "build queenside pressure and the minority attack"};
	}
	if (detect_hanging_pawns(board, colour)) {
		return {name: "hanging_pawns", plan: "keep the pawns dynamic before they become targets"};
	}
	if (detect_iqp(board, colour, counts)) {
		return {name: "iqp", plan: "use activity and central breaks"};
	}
	if (detect_benoni(board, colour)) {
		return {name: "benoni", plan: "use space and outposts"};
	}
	if (detect_closed_center(board)) {
		return {name: "closed_center", plan: "play on the wings and use outposts"};
	}
	if (detect_colour_complex(board, colour, strategic.bishop)) {
		return {name: "colour_complex", plan: "fight for the weakened colour complex"};
	}

	return {name: null, plan: null};
}

function structure_tag(name) {
	switch (name) {
	case "iqp": return "structure_iqp";
	case "hanging_pawns": return "structure_hanging_pawns";
	case "carlsbad": return "structure_carlsbad";
	case "closed_center": return "structure_closed_center";
	case "benoni": return "structure_benoni";
	case "colour_complex": return "structure_colour_complex";
	default: return "quiet";
	}
}

function structure_name_key(name) {
	switch (name) {
	case "iqp": return "isolated queen's pawn";
	case "hanging_pawns": return "hanging pawns";
	case "carlsbad": return "Carlsbad structure";
	case "closed_center": return "closed center";
	case "benoni": return "Benoni structure";
	case "colour_complex": return "colour complex";
	default: return "structure";
	}
}

function structure_plan_key(name) {
	switch (name) {
	case "iqp": return "use activity and central breaks";
	case "hanging_pawns": return "keep the pawns dynamic before they become targets";
	case "carlsbad": return "build queenside pressure and the minority attack";
	case "closed_center": return "play on the wings and use outposts";
	case "benoni": return "use space and outposts";
	case "colour_complex": return "fight for the weakened colour complex";
	default: return "improve piece placement";
	}
}

function structure_theme_key(name) {
	switch (name) {
	case "iqp":
		return "It fits an isolated queen's pawn position: activity and central breaks matter more than passive pawn care.";
	case "hanging_pawns":
		return "It keeps the hanging pawns dynamic, where space and activity matter before the pawns become targets.";
	case "carlsbad":
		return "It fits the Carlsbad plan by leaning into queenside pressure and the minority attack.";
	case "closed_center":
		return "With the center closed, the plan usually shifts to wing play and strong outposts.";
	case "benoni":
		return "This has a Benoni flavor: space and outposts matter more than immediate simplification.";
	case "colour_complex":
		return "The pawn map points to a colour-complex battle, so control of those squares matters more than a quick tactic.";
	default:
		return "";
	}
}

function structure_plan_profile(board, board_after, move, colour) {
	let before = structure_state(board, colour, strategic_profile(board, colour));
	let after_strategic = strategic_profile(board_after, colour);
	let after = structure_state(board_after, colour, after_strategic);
	let structure = after.name ? after : before;
	let source = source_square(move);
	let landing = landing_square(board, move);
	let moved = moved_piece(board, move);
	let score = 0;

	if (!structure.name || !source || !landing || !moved) {
		return {
			name: structure.name,
			plan: structure.plan,
			score: 0,
			tag: structure_tag(structure.name),
			theme_key: structure_theme_key(structure.name)
		};
	}

	switch (structure.name) {
	case "iqp":
		if (["N", "n", "B", "b", "R", "r", "Q", "q"].includes(moved)) {
			score += 0.9;
		}
		if (["d", "e"].includes(landing.s[0])) {
			score += 0.6;
		}
		break;
	case "hanging_pawns":
		if (["N", "n", "B", "b", "R", "r", "Q", "q"].includes(moved)) {
			score += 0.7;
		}
		if (["c", "d", "e"].includes(landing.s[0])) {
			score += 0.5;
		}
		break;
	case "carlsbad": {
		if ((moved === "P" || moved === "p") && ["a", "b"].includes(source.s[0]) && ["a", "b", "c"].includes(landing.s[0])) {
			score += 1.3;
		}
		if (["R", "r", "Q", "q"].includes(moved) && ["b", "c"].includes(landing.s[0])) {
			score += 0.9;
		}
		break;
	}
	case "closed_center":
		if ((moved === "P" || moved === "p") && ["a", "b", "c", "f", "g", "h"].includes(landing.s[0])) {
			score += 1.0;
		}
		if ((moved === "N" || moved === "n") && is_enemy_half_square(landing, colour)) {
			score += 0.6;
		}
		break;
	case "benoni":
		if ((moved === "N" || moved === "n") && is_enemy_half_square(landing, colour)) {
			score += 1.0;
		}
		if ((moved === "P" || moved === "p") && ["e", "f", "c", "b"].includes(landing.s[0])) {
			score += 0.7;
		}
		break;
	case "colour_complex":
		if ((moved === "B" || moved === "b" || moved === "N" || moved === "n" || moved === "Q" || moved === "q") && square_colour_index(landing) !== square_colour_index(source)) {
			score += 0.9;
		}
		break;
	}

	if (before.name !== after.name && after.name) {
		score += 0.4;
	}

	return {
		name: structure.name,
		plan: structure.plan,
		score,
		tag: structure_tag(structure.name),
		theme_key: structure_theme_key(structure.name)
	};
}

function line_snapshot(board, info, max_plies = 6) {
	let moves = Array.isArray(info && info.pv) && info.pv.length > 0 ? info.pv : [info.move];
	let temp = board;
	let played = [];
	let nice = [];

	for (let move of moves) {
		if (!move || temp.illegal(move) !== "") {
			break;
		}

		nice.push(temp.nice_string(move));
		played.push(move);
		temp = temp.move(move);

		if (played.length >= max_plies) {
			break;
		}
	}

	return {board: temp, played, nice};
}

function pv_side_sequence(board, info, start_index = 0, max_count = 2) {
	let moves = Array.isArray(info && info.pv) && info.pv.length > 0 ? info.pv : [info && info.move].filter(Boolean);
	let temp = board;
	let ret = [];

	for (let i = 0; i < moves.length; i++) {
		let move = moves[i];

		if (!move || temp.illegal(move) !== "") {
			break;
		}

		let nice = temp.nice_string(move);

		if (i >= start_index && ((i - start_index) % 2) === 0) {
			ret.push(nice);
			if (ret.length >= max_count) {
				break;
			}
		}

		temp = temp.move(move);
	}

	return ret.join(", ");
}

function side_follow_up(snapshot) {
	let ret = [];

	for (let i = 2; i < snapshot.nice.length && ret.length < 2; i += 2) {
		ret.push(snapshot.nice[i]);
	}

	return ret.join(", ");
}

function line_features(board, info) {
	let mover = board.active;
	let board_after = board.move(info.move);
	let snapshot = line_snapshot(board, info);
	let own_strategic = strategic_profile(snapshot.board, mover);
	let enemy_strategic = strategic_profile(snapshot.board, opposite_colour(mover));
	let immediate_tactics = tactical_motifs(board, board_after, info.move);
	let immediate_structure = structure_plan_profile(board, board_after, info.move, mover);

	return {
		snapshot,
		material: material_balance(snapshot.board, mover),
		development: developed_minor_count(snapshot.board, mover),
		king_safety: king_safety_score(snapshot.board, mover),
		center: center_control_score(snapshot.board, mover),
		space: space_score(snapshot.board, mover),
		castled: is_castled(snapshot.board, mover),
		castling_rights: has_castling_rights(snapshot.board, mover),
		follow_up: side_follow_up(snapshot),
		pawn_structure: own_strategic.pawn_structure.score - enemy_strategic.pawn_structure.score,
		squares: own_strategic.knight.outpost_score - enemy_strategic.knight.outpost_score,
		minor_pieces: own_strategic.minor_pieces - enemy_strategic.minor_pieces,
		endgame_comfort: own_strategic.endgame.score - enemy_strategic.endgame.score,
		remaining_material: total_material(snapshot.board),
		tactics: immediate_tactics,
		structure: immediate_structure,
		strategic: {
			own: own_strategic,
			enemy: enemy_strategic
		}
	};
}

function format_pawn_unit(delta) {
	let abs = Math.abs(delta);
	return abs >= 2 ? abs.toFixed(0) : abs.toFixed(1);
}

function push_coach_note(notes, seen, key, args) {
	if (seen.has(key) || notes.length >= 3) {
		return;
	}

	seen.add(key);
	notes.push({key, args: args || null});
}

function push_coach_metric(metrics, label_key, text_key, args) {
	metrics.push({
		label_key,
		text_key,
		args: args || null
	});
}

function push_why_not_reason(reasons, seen, label_key, text_key, args) {
	let signature = label_key;

	if (seen.has(signature) || reasons.length >= 3) {
		return;
	}

	seen.add(signature);
	reasons.push({
		label_key,
		text_key,
		args: args || null
	});
}

function coach_metrics_for({board, currentInfo, targetInfo, currentPrimary, targetPrimary, currentRank}) {
	if (!currentInfo || !targetInfo) {
		return [];
	}

	let current = line_features(board, currentInfo);
	let target = line_features(board, targetInfo);
	let other_move = board.nice_string(targetInfo.move);
	let metrics = [];
	let material_gap = current.material - target.material;
	let king_gap = current.king_safety - target.king_safety;
	let development_gap = current.development - target.development;
	let center_space_gap = (current.center + current.space) - (target.center + target.space);
	let pawn_structure_gap = current.pawn_structure - target.pawn_structure;
	let square_gap = current.squares - target.squares;
	let minor_piece_gap = current.minor_pieces - target.minor_pieces;
	let endgame_gap = current.endgame_comfort - target.endgame_comfort;
	let current_outpost = current.strategic.own.knight.best_outpost;
	let target_outpost = target.strategic.own.knight.best_outpost;
	let current_tactic = current.tactics[0] || null;
	let target_tactic = target.tactics[0] || null;
	let structure_gap = (current.structure ? current.structure.score : 0) - (target.structure ? target.structure.score : 0);

	if (material_gap >= 1) {
		push_coach_metric(metrics, "Material", "better than {other_move} by about {delta} after the next few PV moves.", {
			other_move,
			delta: format_pawn_unit(material_gap)
		});
	} else if (material_gap <= -1) {
		push_coach_metric(metrics, "Material", "worse than {other_move} by about {delta} after the next few PV moves.", {
			other_move,
			delta: format_pawn_unit(material_gap)
		});
	} else {
		push_coach_metric(metrics, "Material", "roughly level with {other_move} after the next few PV moves.", {other_move});
	}

	if (!is_endgame(board) && current.castling_rights && !target.castling_rights && !target.castled) {
		push_coach_metric(metrics, "King safety", "keeps castling available while {other_move} gives that up.", {other_move});
	} else if (!is_endgame(board) && target.castling_rights && !current.castling_rights && !current.castled) {
		push_coach_metric(metrics, "King safety", "gives up castling while {other_move} keeps it.", {other_move});
	} else if (king_gap >= 2) {
		push_coach_metric(metrics, "King safety", "safer than {other_move}.", {other_move});
	} else if (king_gap <= -2) {
		push_coach_metric(metrics, "King safety", "riskier than {other_move}.", {other_move});
	} else {
		push_coach_metric(metrics, "King safety", "about as safe as {other_move}.", {other_move});
	}

	if (development_gap >= 1) {
		push_coach_metric(metrics, "Development", "faster by {delta} minor piece(s) than {other_move}.", {
			other_move,
			delta: Math.abs(development_gap).toString()
		});
	} else if (development_gap <= -1) {
		push_coach_metric(metrics, "Development", "slower by {delta} minor piece(s) than {other_move}.", {
			other_move,
			delta: Math.abs(development_gap).toString()
		});
	} else {
		push_coach_metric(metrics, "Development", "about the same as {other_move}.", {other_move});
	}

	if (center_space_gap >= 2) {
		push_coach_metric(metrics, "Center / space", "claims more of the center and more space than {other_move}.", {other_move});
	} else if (center_space_gap <= -2) {
		push_coach_metric(metrics, "Center / space", "concedes some center and space edge to {other_move}.", {other_move});
	} else {
		push_coach_metric(metrics, "Center / space", "about the same as {other_move}.", {other_move});
	}

	if (current_tactic && (!target_tactic || current_tactic.tag !== target_tactic.tag)) {
		push_coach_metric(metrics, "Tactics", "keeps the immediate {motif}, which {other_move} does not.", {
			other_move,
			motif: current_tactic.motif_key
		});
	} else if (target_tactic && (!current_tactic || current_tactic.tag !== target_tactic.tag)) {
		push_coach_metric(metrics, "Tactics", "{other_move} keeps the immediate {motif}, which this line misses.", {
			other_move,
			motif: target_tactic.motif_key
		});
	} else {
		push_coach_metric(metrics, "Tactics", "tactical pressure is about the same as after {other_move}.", {other_move});
	}

	if (pawn_structure_gap >= 1.1) {
		push_coach_metric(metrics, "Pawn structure", "healthier than {other_move}: fewer isolated, doubled, or backward pawns, and the chain stays more connected.", {other_move});
	} else if (pawn_structure_gap <= -1.1) {
		push_coach_metric(metrics, "Pawn structure", "looser than {other_move}: more isolated, doubled, or backward pawns to look after.", {other_move});
	} else {
		push_coach_metric(metrics, "Pawn structure", "about as healthy as {other_move}.", {other_move});
	}

	if (square_gap >= 1.5 && current_outpost) {
		push_coach_metric(metrics, "Squares", "gets a durable outpost on {square}, which {other_move} does not match.", {
			other_move,
			square: current_outpost
		});
	} else if (square_gap <= -1.5 && target_outpost) {
		push_coach_metric(metrics, "Squares", "{other_move} gets the more durable outpost on {square}.", {
			other_move,
			square: target_outpost
		});
	} else if (square_gap >= 1) {
		push_coach_metric(metrics, "Squares", "gets the better weak-square grip and outpost potential than {other_move}.", {other_move});
	} else if (square_gap <= -1) {
		push_coach_metric(metrics, "Squares", "concedes the better weak-square grip and outpost potential to {other_move}.", {other_move});
	} else {
		push_coach_metric(metrics, "Squares", "about the same weak-square grip as {other_move}.", {other_move});
	}

	if (minor_piece_gap >= 1.4) {
		push_coach_metric(metrics, "Minor pieces", "coordinates the bishops and knights better than {other_move}.", {other_move});
	} else if (minor_piece_gap <= -1.4) {
		push_coach_metric(metrics, "Minor pieces", "leaves the bishops and knights less harmonious than {other_move}.", {other_move});
	} else {
		push_coach_metric(metrics, "Minor pieces", "about as harmonious as {other_move}.", {other_move});
	}

	if (endgame_gap >= 1.2 && current.remaining_material <= target.remaining_material) {
		push_coach_metric(metrics, "Endgame", "if pieces come off, the endgame looks more comfortable than after {other_move}.", {other_move});
	} else if (endgame_gap <= -1.2 && current.remaining_material <= target.remaining_material) {
		push_coach_metric(metrics, "Endgame", "if pieces come off, the endgame looks less comfortable than after {other_move}.", {other_move});
	} else if (endgame_gap >= 1.2) {
		push_coach_metric(metrics, "Endgame", "endgame prospects are better than after {other_move}.", {other_move});
	} else if (endgame_gap <= -1.2) {
		push_coach_metric(metrics, "Endgame", "endgame prospects are less comfortable than after {other_move}.", {other_move});
	} else {
		push_coach_metric(metrics, "Endgame", "endgame prospects are about as comfortable as after {other_move}.", {other_move});
	}

	if (current.structure && current.structure.name && structure_gap >= 0.8) {
		push_coach_metric(metrics, "Structure / plan", "fits the {structure_name} plan more naturally than {other_move}.", {
			other_move,
			structure_name: structure_name_key(current.structure.name)
		});
	} else if (target.structure && target.structure.name && structure_gap <= -0.8) {
		push_coach_metric(metrics, "Structure / plan", "{other_move} fits the {structure_name} plan more naturally.", {
			other_move,
			structure_name: structure_name_key(target.structure.name)
		});
	} else if (current.structure && current.structure.name) {
		push_coach_metric(metrics, "Structure / plan", "heads for a similar {structure_name} plan to {other_move}.", {
			other_move,
			structure_name: structure_name_key(current.structure.name)
		});
	} else if (target.structure && target.structure.name) {
		push_coach_metric(metrics, "Structure / plan", "heads for a similar {structure_name} plan to {other_move}.", {
			other_move,
			structure_name: structure_name_key(target.structure.name)
		});
	}

	if (current.follow_up && target.follow_up) {
		if (current.follow_up === target.follow_up) {
			push_coach_metric(metrics, "Plan", "follows a similar plan to {other_move}.", {other_move});
		} else if (currentRank === 1) {
			push_coach_metric(metrics, "Plan", "natural follow-up is {pv}.", {pv: current.follow_up});
		} else {
			push_coach_metric(metrics, "Plan", "{other_move} has the cleaner follow-up with {pv}.", {
				other_move,
				pv: target.follow_up
			});
		}
	} else if (current.follow_up) {
		push_coach_metric(metrics, "Plan", "natural follow-up is {pv}.", {pv: current.follow_up});
	} else if (target.follow_up) {
		push_coach_metric(metrics, "Plan", "{other_move} has the cleaner follow-up with {pv}.", {
			other_move,
			pv: target.follow_up
		});
	} else if (currentPrimary && targetPrimary && currentPrimary === targetPrimary) {
		push_coach_metric(metrics, "Plan", "follows a similar plan to {other_move}.", {other_move});
	} else if (currentPrimary && targetPrimary) {
		push_coach_metric(metrics, "Plan", "first tries to {current_idea}, while {other_move} is more coherent around {other_idea}.", {
			current_idea: idea_phrase_key(currentPrimary),
			other_move,
			other_idea: idea_phrase_key(targetPrimary)
		});
	} else {
		push_coach_metric(metrics, "Plan", "follows a similar plan to {other_move}.", {other_move});
	}

	return metrics;
}

function why_not_reasons_for({board, currentInfo, targetInfo, currentPrimary, targetPrimary, currentRank, replyPreview}) {
	if (!currentInfo || !targetInfo) {
		return [];
	}

	let current = line_features(board, currentInfo);
	let target = line_features(board, targetInfo);
	let reasons = [];
	let seen = new Set();
	let other_move = board.nice_string(targetInfo.move);
	let current_better = currentRank === 1;
	let material_gap = current.material - target.material;
	let king_gap = current.king_safety - target.king_safety;
	let development_gap = current.development - target.development;
	let center_space_gap = (current.center + current.space) - (target.center + target.space);
	let pawn_structure_gap = current.pawn_structure - target.pawn_structure;
	let square_gap = current.squares - target.squares;
	let minor_piece_gap = current.minor_pieces - target.minor_pieces;
	let endgame_gap = current.endgame_comfort - target.endgame_comfort;
	let current_tactic = current.tactics[0] || null;
	let target_tactic = target.tactics[0] || null;
	let structure_gap = (current.structure ? current.structure.score : 0) - (target.structure ? target.structure.score : 0);

	if (current_better && material_gap >= 1) {
		push_why_not_reason(reasons, seen, "Tactics", "The tactical edge is material: after the next few PV moves, this line comes out about {delta} better than {other_move}.", {
			delta: format_pawn_unit(material_gap),
			other_move
		});
	} else if (!current_better && material_gap <= -1) {
		push_why_not_reason(reasons, seen, "Tactics", "The tactical issue is material: after the next few PV moves, {other_move} comes out about {delta} better.", {
			delta: format_pawn_unit(material_gap),
			other_move
		});
	}

	if (current_better && current_tactic && (!target_tactic || current_tactic.tag !== target_tactic.tag)) {
		push_why_not_reason(reasons, seen, "Tactics", "Tactically, the alternative misses the immediate {motif}.", {
			motif: current_tactic.motif_key
		});
	} else if (!current_better && target_tactic && (!current_tactic || current_tactic.tag !== target_tactic.tag)) {
		push_why_not_reason(reasons, seen, "Tactics", "Tactically, {other_move} keeps the immediate {motif}, which this move misses.", {
			other_move,
			motif: target_tactic.motif_key
		});
	}

	if (!is_endgame(board)) {
		if (current_better && current.castling_rights && !target.castling_rights && !target.castled) {
			push_why_not_reason(reasons, seen, "King safety", "King safety is one reason the alternative falls short: {other_move} gives up castling while this line keeps it.", {
				other_move
			});
		} else if (!current_better && target.castling_rights && !current.castling_rights && !current.castled) {
			push_why_not_reason(reasons, seen, "King safety", "King safety is the issue: this move gives up castling while {other_move} keeps it.", {
				other_move
			});
		} else if (current_better && king_gap >= 2) {
			push_why_not_reason(reasons, seen, "King safety", "King safety is one edge here: the king stays safer than after {other_move}.", {
				other_move
			});
		} else if (!current_better && king_gap <= -2) {
			push_why_not_reason(reasons, seen, "King safety", "King safety is one issue: the king ends up less safe than after {other_move}.", {
				other_move
			});
		}
	}

	if (!current_better) {
		if (currentPrimary === "early_king") {
			push_why_not_reason(reasons, seen, "Tempo", "The tempo problem is obvious: this spends time bringing the king out instead of developing.", null);
		} else if (currentPrimary === "queen_early") {
			push_why_not_reason(reasons, seen, "Tempo", "The tempo problem is obvious: this brings the queen out too soon and lets the opponent gain time.", null);
		} else if (currentPrimary === "slow_pawn") {
			push_why_not_reason(reasons, seen, "Tempo", "The tempo problem is obvious: this spends a move on a flank pawn instead of development.", null);
		}
	}

	if (current_better && development_gap >= 1) {
		push_why_not_reason(reasons, seen, "Tempo", "The alternative falls short on tempo: this line gets {delta} more minor pieces out.", {
			delta: Math.abs(development_gap).toString()
		});
	} else if (!current_better && development_gap <= -1) {
		push_why_not_reason(reasons, seen, "Tempo", "The tempo issue is development: {other_move} gets {delta} more minor pieces out.", {
			other_move,
			delta: Math.abs(development_gap).toString()
		});
	}

	if (current_better && center_space_gap >= 2) {
		push_why_not_reason(reasons, seen, "Position", "Positionally, this line gets the firmer center and more space than {other_move}.", {
			other_move
		});
	} else if (!current_better && center_space_gap <= -2) {
		push_why_not_reason(reasons, seen, "Position", "Positionally, {other_move} gets the firmer center and more space.", {
			other_move
		});
	}

	if (current_better && pawn_structure_gap >= 1.1) {
		push_why_not_reason(reasons, seen, "Pawn structure", "Long-term, the alternative leaves the pawn structure looser: more isolated, doubled, or backward pawns than this line.", {
			other_move
		});
	} else if (!current_better && pawn_structure_gap <= -1.1) {
		push_why_not_reason(reasons, seen, "Pawn structure", "Long-term, the pawn structure is one problem: {other_move} keeps fewer isolated, doubled, or backward pawns.", {
			other_move
		});
	}

	if (current_better && square_gap >= 1.5) {
		push_why_not_reason(reasons, seen, "Squares", "Square-wise, the alternative falls short because it does not get the same durable outpost or weak-square grip.", {
			other_move
		});
	} else if (!current_better && square_gap <= -1.5) {
		push_why_not_reason(reasons, seen, "Squares", "Square-wise, this move falls short because {other_move} gets the more durable outpost or weak-square grip.", {
			other_move
		});
	}

	if (current_better && minor_piece_gap >= 1.4) {
		push_why_not_reason(reasons, seen, "Minor pieces", "The alternative falls short because the bishops and knights do not fit the structure as well.", {
			other_move
		});
	} else if (!current_better && minor_piece_gap <= -1.4) {
		push_why_not_reason(reasons, seen, "Minor pieces", "The minor-piece issue is real: {other_move} keeps the bishops and knights working together more naturally.", {
			other_move
		});
	}

	if (current_better && endgame_gap >= 1.2 && current.remaining_material <= target.remaining_material) {
		push_why_not_reason(reasons, seen, "Endgame", "The alternative falls short because, once pieces come off, the resulting endgame is less comfortable.", {
			other_move
		});
	} else if (!current_better && endgame_gap <= -1.2 && current.remaining_material <= target.remaining_material) {
		push_why_not_reason(reasons, seen, "Endgame", "The endgame direction is one issue: if pieces come off, {other_move} leaves the more comfortable ending.", {
			other_move
		});
	}

	if (current_better && current.structure && current.structure.name && structure_gap >= 0.8) {
		push_why_not_reason(reasons, seen, "Structure / plan", "Structurally, the alternative fits the {structure_name} plan less naturally.", {
			structure_name: structure_name_key(current.structure.name)
		});
	} else if (!current_better && target.structure && target.structure.name && structure_gap <= -0.8) {
		push_why_not_reason(reasons, seen, "Structure / plan", "Structurally, {other_move} fits the {structure_name} plan more naturally.", {
			other_move,
			structure_name: structure_name_key(target.structure.name)
		});
	}

	if (replyPreview) {
		if (!current_better && replyPreview.note_args && replyPreview.note_args.reply_move && replyPreview.note_args.pv) {
			push_why_not_reason(reasons, seen, "Plan", "The plan problem is that after {reply_move}, the opponent can often continue with {pv}.", {
				reply_move: replyPreview.note_args.reply_move,
				pv: replyPreview.note_args.pv
			});
		} else if (!current_better && replyPreview.summary_args && replyPreview.summary_args.reply_move) {
			push_why_not_reason(reasons, seen, "Plan", "The plan problem is that after {reply_move}, the opponent gets a comfortable version of {reply_idea}.", {
				reply_move: replyPreview.summary_args.reply_move,
				reply_idea: replyPreview.summary_args.reply_idea
			});
		} else if (current_better && currentPrimary && targetPrimary && currentPrimary !== targetPrimary) {
			push_why_not_reason(reasons, seen, "Plan", "The alternative falls short because it is less coherent: it is more about {other_idea} than {current_idea}.", {
				other_idea: idea_phrase_key(targetPrimary),
				current_idea: idea_phrase_key(currentPrimary)
			});
		} else if (current_better && target.follow_up) {
			push_why_not_reason(reasons, seen, "Plan", "The alternative falls short because the plan is less coherent after {other_move}.", {
				other_move
			});
		}
	}

	if (reasons.length === 0) {
		if (current_better) {
			push_why_not_reason(reasons, seen, "Plan", "The alternative falls short because the plan is less coherent after {other_move}.", {
				other_move
			});
		} else {
			push_why_not_reason(reasons, seen, "Plan", "The move is not refuted, but it lets the opponent solve the position a little too comfortably.", null);
		}
	}

	return reasons;
}

function coach_notes_for({board, currentInfo, targetInfo, currentPrimary, targetPrimary, currentRank}) {
	if (!currentInfo || !targetInfo) {
		return [];
	}

	let current = line_features(board, currentInfo);
	let target = line_features(board, targetInfo);
	let notes = [];
	let seen = new Set();
	let other_move = board.nice_string(targetInfo.move);
	let current_better = currentRank === 1;
	let material_gap = current.material - target.material;
	let king_gap = current.king_safety - target.king_safety;
	let development_gap = current.development - target.development;
	let center_space_gap = (current.center + current.space) - (target.center + target.space);
	let pawn_structure_gap = current.pawn_structure - target.pawn_structure;
	let square_gap = current.squares - target.squares;
	let minor_piece_gap = current.minor_pieces - target.minor_pieces;
	let endgame_gap = current.endgame_comfort - target.endgame_comfort;
	let current_outpost = current.strategic.own.knight.best_outpost;
	let target_outpost = target.strategic.own.knight.best_outpost;
	let current_tactic = current.tactics[0] || null;
	let target_tactic = target.tactics[0] || null;
	let structure_gap = (current.structure ? current.structure.score : 0) - (target.structure ? target.structure.score : 0);

	if (current_better && material_gap >= 1) {
		push_coach_note(notes, seen, "Material is one of the differences: this line comes out about {delta} better than {other_move} after the first few PV moves.", {
			delta: format_pawn_unit(material_gap),
			other_move
		});
	} else if (!current_better && material_gap <= -1) {
		push_coach_note(notes, seen, "Material is one of the differences: {other_move} comes out about {delta} better after the first few PV moves.", {
			delta: format_pawn_unit(material_gap),
			other_move
		});
	}

	if (!is_endgame(board)) {
		if (current_better && current.castling_rights && !target.castling_rights && !target.castled) {
			push_coach_note(notes, seen, "This line keeps castling available, while {other_move} gives that up.", {other_move});
		} else if (!current_better && target.castling_rights && !current.castling_rights && !current.castled) {
			push_coach_note(notes, seen, "{other_move} keeps castling available, while this line gives that up.", {other_move});
		} else if (current_better && king_gap >= 2) {
			push_coach_note(notes, seen, "King safety is a plus for this move: it keeps the king safer than {other_move}.", {other_move});
		} else if (!current_better && king_gap <= -2) {
			push_coach_note(notes, seen, "King safety is one of the problems: {other_move} keeps the king safer than this line.", {other_move});
		}
	}

	if (current_better && development_gap >= 1) {
		push_coach_note(notes, seen, "Development is a plus for this move: it gets {delta} more minor pieces out than {other_move}.", {
			delta: Math.abs(development_gap).toString(),
			other_move
		});
	} else if (!current_better && development_gap <= -1) {
		push_coach_note(notes, seen, "Development is slower here: {other_move} gets {delta} more minor pieces out.", {
			delta: Math.abs(development_gap).toString(),
			other_move
		});
	}

	if (current_better && center_space_gap >= 2) {
		push_coach_note(notes, seen, "This line fights harder for the center and claims more space than {other_move}.", {other_move});
	} else if (!current_better && center_space_gap <= -2) {
		push_coach_note(notes, seen, "{other_move} fights harder for the center and claims more space.", {other_move});
	}

	if (notes.length < 3) {
		if (current_better && current_tactic && (!target_tactic || current_tactic.tag !== target_tactic.tag)) {
			push_coach_note(notes, seen, "This line keeps the immediate {motif}, so the opponent still has a tactical problem to solve.", {
				motif: current_tactic.motif_key
			});
		} else if (!current_better && target_tactic && (!current_tactic || current_tactic.tag !== target_tactic.tag)) {
			push_coach_note(notes, seen, "{other_move} keeps the immediate {motif}, which is one reason it is more convincing.", {
				other_move,
				motif: target_tactic.motif_key
			});
		}
	}

	if (current_better && pawn_structure_gap >= 1.1) {
		push_coach_note(notes, seen, "Long-term, the pawn structure stays healthier than after {other_move}.", {other_move});
	} else if (!current_better && pawn_structure_gap <= -1.1) {
		push_coach_note(notes, seen, "Long-term, {other_move} keeps the pawn structure healthier.", {other_move});
	}

	if (current_better && square_gap >= 1.5 && current_outpost) {
		push_coach_note(notes, seen, "Square-wise, this line gets a durable outpost on {square}.", {square: current_outpost});
	} else if (!current_better && square_gap <= -1.5 && target_outpost) {
		push_coach_note(notes, seen, "Square-wise, {other_move} gets the more durable outpost on {square}.", {
			other_move,
			square: target_outpost
		});
	}

	if (current_better && current.strategic.own.bishop.good > target.strategic.own.bishop.good) {
		push_coach_note(notes, seen, "The bishop fits the pawn chain better here than after {other_move}.", {other_move});
	} else if (!current_better && current.strategic.own.bishop.bad > target.strategic.own.bishop.bad) {
		push_coach_note(notes, seen, "The bishop is less happy in this structure; {other_move} gives it the cleaner role.", {other_move});
	}

	if (notes.length < 3) {
		if (current_better && minor_piece_gap >= 1.4) {
			push_coach_note(notes, seen, "The minor pieces fit the structure better here than after {other_move}.", {other_move});
		} else if (!current_better && minor_piece_gap <= -1.4) {
			push_coach_note(notes, seen, "The minor pieces fit the structure better after {other_move}.", {other_move});
		}
	}

	if (notes.length < 3) {
		if (current_better && endgame_gap >= 1.2) {
			push_coach_note(notes, seen, "If the game simplifies, this line points to a more comfortable endgame.", null);
		} else if (!current_better && endgame_gap <= -1.2) {
			push_coach_note(notes, seen, "If the game simplifies, {other_move} points to a more comfortable endgame.", {other_move});
		}
	}

	if (notes.length < 3) {
		if (current.structure && current.structure.name && (current_better || structure_gap >= 0.8)) {
			push_coach_note(notes, seen, "The structure is now {structure_name}, so the long-term plan is to {structure_plan}.", {
				structure_name: structure_name_key(current.structure.name),
				structure_plan: structure_plan_key(current.structure.name)
			});
		} else if (target.structure && target.structure.name && structure_gap <= -0.8) {
			push_coach_note(notes, seen, "{other_move} fits the {structure_name} structure more naturally, where the plan is to {structure_plan}.", {
				other_move,
				structure_name: structure_name_key(target.structure.name),
				structure_plan: structure_plan_key(target.structure.name)
			});
		}
	}

	if (notes.length < 3) {
		if (current_better && current.follow_up) {
			push_coach_note(notes, seen, "Plan-wise, the follow-up with {pv} keeps the pieces working together naturally.", {
				pv: current.follow_up
			});
		} else if (!current_better && target.follow_up) {
			push_coach_note(notes, seen, "Plan-wise, {other_move} can continue with {pv}, so the pieces work together more naturally.", {
				other_move,
				pv: target.follow_up
			});
		} else if (currentPrimary && targetPrimary && currentPrimary !== targetPrimary) {
			push_coach_note(notes, seen, "Plan-wise, {other_move} is more coherent because it first tries to {other_idea}.", {
				other_move,
				other_idea: idea_phrase_key(targetPrimary)
			});
		}
	}

	return notes;
}

function reply_preview_for({board, info, currentPrimary, currentRank, touched}) {
	if (!info || !Array.isArray(info.pv) || info.pv.length < 2) {
		return null;
	}

	let board_after = board.move(info.move);
	let reply_move = info.pv[1];

	if (!reply_move || board_after.illegal(reply_move) !== "") {
		return null;
	}

	let reply_info = {
		move: reply_move,
		pv: info.pv.slice(1),
		cp: typeof info.cp === "number" ? -info.cp : info.cp,
		q: typeof info.q === "number" ? -info.q : info.q,
		mate: typeof info.mate === "number" ? -info.mate : info.mate,
		__touched: !!info.__touched
	};

	let reply_explanation = explainMove({
		node: {
			board: board_after,
			move: info.move
		},
		info: reply_info,
		bestInfo: reply_info,
		secondInfo: null,
		infoList: [reply_info]
	}, true);

	let reply_nice_move = board_after.nice_string(reply_move);
	let reply_idea = idea_phrase_key(reply_explanation.primary);
	let later_plan = pv_side_sequence(board, info, 3);
	let summary_key = "The engine expects {reply_move} in reply, first trying to {reply_idea}.";
	let summary_args = {
		reply_move: reply_nice_move,
		reply_idea
	};
	let note_key = "That is the practical drawback: the opponent gets a comfortable answer immediately.";
	let note_args = null;

	if (!touched) {
		summary_key = "If the opponent gets time, a natural reply is {reply_move}, aiming to {reply_idea}.";
	} else if (currentRank === 1) {
		summary_key = "The best resistance is {reply_move}: it first tries to {reply_idea}.";
	}

	if (currentRank === 1) {
		if (later_plan) {
			note_key = "If the line continues, the opponent often follows with {pv}, so that is the main resistance to your plan.";
			note_args = {pv: later_plan};
		} else {
			note_key = "That is the best resistance the engine has found after your move.";
		}
	} else if (["early_king", "queen_early", "slow_pawn"].includes(currentPrimary)) {
		if (later_plan) {
			note_key = "That is why the move is hard to justify: after {reply_move}, the opponent gets this idea for free and can often follow with {pv}.";
			note_args = {
				reply_move: reply_nice_move,
				pv: later_plan
			};
		} else {
			note_key = "That is why the move is hard to justify: after {reply_move}, the opponent gets this idea for free.";
			note_args = {reply_move: reply_nice_move};
		}
	} else if (later_plan) {
		note_key = "From there the opponent often follows with {pv}, so the plan is easy for them to play.";
		note_args = {pv: later_plan};
	}

	return {
		summary_key,
		summary_args,
		theme_key: reply_explanation.theme_keys[0] || null,
		theme_args: reply_explanation.theme_args[0] || null,
		note_key,
		note_args
	};
}

function push_theme(themes, raw_tags, seen, key, args, raw_tag) {
	if (seen.has(key) || themes.length >= 4) {
		return;
	}

	seen.add(key);
	themes.push({key, args: args || null});

	if (raw_tag) {
		raw_tags.push(raw_tag);
	}
}

function primary_tag(raw_tags) {
	return raw_tags.length > 0 ? raw_tags[0] : "quiet";
}

function summary_key_for(primary, rank, best_value, delta_cp, top_gap, mate, touched) {
	if (!touched) {
		if (primary === "early_king") {
			return "Even before a deep search, this king move looks suspicious: it brings the king out early and usually gives up castling.";
		}
		if (primary === "queen_early") {
			return "Even before a deep search, this develops the queen very early and may let the opponent gain time by attacking it.";
		}
		if (primary === "slow_pawn") {
			return "Even before a deep search, this is a slow flank-pawn move that neglects development and the center.";
		}
		return "This move is legal and follows a clear idea, but the engine has not searched it deeply yet.";
	}

	if (rank === 1) {
		if (mate) {
			return "This move converts the position immediately with a forcing mating attack.";
		}
		if (primary === "fork") {
			return "This move creates a double attack and immediately asks tactical questions.";
		}
		if (primary === "pin") {
			return "This pin makes the opponent's coordination much harder.";
		}
		if (primary === "skewer") {
			return "This skewer lines the pieces up awkwardly and threatens material.";
		}
		if (primary === "discovered_attack") {
			return "This discovered attack suddenly brings another piece into the action.";
		}
		if (primary === "back_rank") {
			return "This leans on a back-rank weakness and keeps the king short of squares.";
		}
		if (primary === "trapped_piece") {
			return "This nearly traps a piece, so the opponent may have no comfortable square.";
		}
		if (primary === "castle") {
			return "The first priority is king safety, so castling now makes the most sense.";
		}
		if (primary === "development") {
			return "The engine wants to finish development before starting concrete operations.";
		}
		if (primary === "center_pawn") {
			return "The point is to claim central space while keeping the position easy to handle.";
		}
		if (primary === "save_piece") {
			return "This tidies up a loose piece and removes a tactical problem.";
		}
		if (primary === "structure_iqp") {
			return "This fits the isolated queen's pawn plan: keep the pieces active before the pawn becomes a target.";
		}
		if (primary === "structure_hanging_pawns") {
			return "This fits the hanging-pawn plan: stay active before the pawns become targets.";
		}
		if (primary === "structure_carlsbad") {
			return "This fits a Carlsbad-type plan, where queenside pressure is the long-term story.";
		}
		if (primary === "structure_closed_center") {
			return "With the center closed, this follows the usual wing-play plan.";
		}
		if (primary === "structure_benoni") {
			return "This follows a Benoni-style plan built around space, outposts, and active pieces.";
		}
		if (primary === "structure_colour_complex") {
			return "This follows the colour-complex plan: fight for the weakened squares.";
		}
		if (primary === "king_activity") {
			return "In the endgame, the king is strong enough to step forward.";
		}
		if (primary === "threat") {
			return "The move creates an immediate threat and asks the opponent a concrete question.";
		}
		if (primary === "simplify") {
			return "The cleanest plan is to simplify while the evaluation is favorable.";
		}
		if (primary === "capture" && best_value >= 80) {
			return "The engine prefers to cash in immediately instead of keeping the tension.";
		}
		if (top_gap !== null && top_gap >= 80) {
			return "This looks like the only move that clearly keeps the position under control.";
		}
		if (best_value >= 120) {
			return "This is the clearest way to press the advantage.";
		}
		if (best_value <= -120) {
			return "This is the main defensive resource in a difficult position.";
		}
		return "This is the engine's top choice and a natural way to keep the balance.";
	}

	if (delta_cp !== null && delta_cp <= 25) {
		if (["development", "center_pawn", "castle", "king_activity"].includes(primary)) {
			return "This follows the same strategic idea as the best line and stays very close.";
		}
		return "This is a practical alternative that stays very close to the best line.";
	}

	if (rank !== 1 && primary === "early_king") {
		if (delta_cp !== null && delta_cp >= 120) {
			return "This brings the king out far too early, weakens king safety, and the engine dislikes it immediately.";
		}
		return "This brings the king out early and usually gives up castling for too little in return.";
	}

	if (rank !== 1 && primary === "queen_early") {
		if (delta_cp !== null && delta_cp >= 100) {
			return "This queen move is too early for the opening, and the engine expects the opponent to gain time against it.";
		}
		return "This develops the queen before the pieces are ready, so it risks losing time to natural attacks.";
	}

	if (rank !== 1 && primary === "slow_pawn") {
		if (delta_cp !== null && delta_cp >= 80) {
			return "This spends a full tempo on a slow flank-pawn move and falls behind in the opening race.";
		}
		return "This is a slow flank-pawn move that does little for development or central control.";
	}

	if (primary === "save_piece" && delta_cp !== null && delta_cp <= 80) {
		return "It solves the immediate problem, but not in the most precise way.";
	}

	if (["fork", "pin", "skewer", "discovered_attack", "back_rank", "trapped_piece"].includes(primary)) {
		return "It sees the right tactical idea, but not in the cleanest version.";
	}

	if (["structure_iqp", "structure_hanging_pawns", "structure_carlsbad", "structure_closed_center", "structure_benoni", "structure_colour_complex"].includes(primary)) {
		return "It follows a reasonable long-term plan, but it is not the engine's cleanest version.";
	}

	if (best_value >= 120) {
		return "It keeps the right idea, but misses a cleaner continuation.";
	}

	if (best_value <= -120) {
		return "This still fights, but it makes the defensive task harder than the best line.";
	}

	if (delta_cp !== null && delta_cp <= 80) {
		return "This is playable, but it gives the opponent a little more freedom.";
	}

	return "This is understandable, but it concedes a noticeable amount compared with the best move.";
}

function pv_hint_key_for(primary, has_pv) {
	if (!has_pv) {
		return "The idea is mainly positional: improve the pieces and keep the same plan.";
	}

	switch (primary) {
	case "fork":
	case "pin":
	case "skewer":
	case "discovered_attack":
	case "back_rank":
	case "trapped_piece":
		return "The engine keeps the tactical pressure going with {pv}.";
	case "castle":
		return "After castling, the PV continues with {pv}.";
	case "development":
		return "The follow-up is to finish development with {pv}.";
	case "center_pawn":
		return "The continuation supports the center with {pv}.";
	case "passed_pawn":
		return "The PV keeps the pawn rolling with {pv}.";
	case "open_file":
	case "half_open_file":
		return "The engine keeps pressing on the file with {pv}.";
	case "pawn_structure":
		return "The continuation keeps the structure healthy with {pv}.";
	case "outpost":
		return "The continuation keeps using the outpost with {pv}.";
	case "bishop_quality":
	case "knight_quality":
		return "The continuation keeps improving the minor pieces with {pv}.";
	case "endgame_direction":
		return "The continuation heads for a more comfortable endgame with {pv}.";
	case "structure_iqp":
		return "The continuation keeps the isolated queen's pawn position active with {pv}.";
	case "structure_hanging_pawns":
		return "The continuation keeps the hanging pawns dynamic with {pv}.";
	case "structure_carlsbad":
		return "The continuation keeps the queenside pressure growing with {pv}.";
	case "structure_closed_center":
		return "The continuation keeps the wing plan going with {pv}.";
	case "structure_benoni":
		return "The continuation keeps leaning on space and outposts with {pv}.";
	case "structure_colour_complex":
		return "The continuation keeps pressing the weakened colour complex with {pv}.";
	case "check":
	case "mate":
	case "capture":
	case "threat":
	case "promotion":
		return "The engine keeps asking tactical questions with {pv}.";
	case "save_piece":
	case "defense":
		return "The PV shows the position settling down after {pv}.";
	case "king_activity":
		return "Then the king keeps improving with {pv}.";
	case "simplify":
		return "The continuation keeps the conversion simple with {pv}.";
	case "early_king":
	case "queen_early":
	case "slow_pawn":
		return "The engine's preferred setup after this is {pv}.";
	default:
		return "The engine's main continuation is {pv}.";
	}
}

function idea_phrase_key(primary) {
	switch (primary) {
	case "fork": return "create a double attack";
	case "pin": return "pin a piece to a bigger target";
	case "skewer": return "set up a skewer";
	case "discovered_attack": return "uncover a discovered attack";
	case "back_rank": return "lean on the back rank";
	case "trapped_piece": return "trap a piece";
	case "development": return "finish development";
	case "center_pawn": return "claim central space";
	case "castle": return "secure the king";
	case "save_piece": return "save a loose piece";
	case "threat": return "create an immediate threat";
	case "capture":
	case "recapture":
	case "promotion": return "win material immediately";
	case "passed_pawn": return "push the passed pawn";
	case "king_activity": return "activate the king";
	case "open_file":
	case "half_open_file": return "put the rook on an active file";
	case "pawn_structure": return "improve the pawn structure";
	case "outpost": return "claim a durable outpost";
	case "bishop_quality": return "improve the bishop against the pawn chain";
	case "knight_quality": return "improve the knight's long-term square";
	case "endgame_direction": return "steer toward a comfortable endgame";
	case "structure_iqp": return "play around the isolated queen's pawn";
	case "structure_hanging_pawns": return "keep the hanging pawns active";
	case "structure_carlsbad": return "lean into queenside pressure";
	case "structure_closed_center": return "switch play to the wing";
	case "structure_benoni": return "use space and outposts";
	case "structure_colour_complex": return "press the weak colour complex";
	case "defense":
	case "escape_check": return "stabilize the position";
	case "simplify": return "simplify into a cleaner position";
	case "check":
	case "mate": return "keep the initiative";
	case "early_king": return "bring the king out early";
	case "queen_early": return "bring the queen out too soon";
	case "slow_pawn": return "spend a tempo on a flank pawn";
	default: return "improve piece placement";
	}
}

function delta_args_for(bestInfo, info) {
	let args = format_delta_args(bestInfo, info);
	if (!args) {
		return null;
	}
	return args;
}

function comparison_for({current, best, rival, bestInfo, info, best_value, delta_cp, top_gap}) {
	if (!current.touched) {
		if (!best || best.move === current.move) {
			return {
				key: "The engine has not searched this move deeply enough to compare it confidently.",
				args: null
			};
		}

		if (current.primary === "early_king") {
			return {
				key: "This brings the king out very early, while the engine would rather {best_idea} with {best_move}.",
				args: {
					best_idea: idea_phrase_key(best.primary),
					best_move: best.nice_move
				}
			};
		}

		if (current.primary === "queen_early") {
			return {
				key: "This brings the queen out too soon, while the engine would rather {best_idea} with {best_move}.",
				args: {
					best_idea: idea_phrase_key(best.primary),
					best_move: best.nice_move
				}
			};
		}

		if (current.primary === "slow_pawn") {
			return {
				key: "This spends a tempo on a flank pawn, while the engine would rather {best_idea} with {best_move}.",
				args: {
					best_idea: idea_phrase_key(best.primary),
					best_move: best.nice_move
				}
			};
		}

		if (current.primary === best.primary) {
			return {
				key: "This follows a similar plan to {best_move}, but the engine is not prioritizing it yet.",
				args: {best_move: best.nice_move}
			};
		}

		return {
			key: "This move aims to {current_idea}, but the engine would rather {best_idea} with {best_move}.",
			args: {
				current_idea: idea_phrase_key(current.primary),
				best_idea: idea_phrase_key(best.primary),
				best_move: best.nice_move
			}
		};
	}

	if (current.rank === 1) {
		if (!rival || rival.move === current.move) {
			return {
				key: "The engine has not produced a meaningful alternative yet.",
				args: null
			};
		}

		if (current.primary === rival.primary) {
			if (top_gap !== null && top_gap <= 15) {
				return {
					key: "Compared with {other_move}, this move carries out the same idea just a touch more accurately.",
					args: {other_move: rival.nice_move}
				};
			}

			if (top_gap !== null && top_gap <= 40) {
				return {
					key: "Compared with {other_move}, this move carries out the same idea more cleanly.",
					args: {other_move: rival.nice_move}
				};
			}
		}

		let base_args = {
			other_move: rival.nice_move,
			current_idea: idea_phrase_key(current.primary),
			other_idea: idea_phrase_key(rival.primary)
		};
		let delta_args = delta_args_for(bestInfo, rival.source_info);

		if (delta_args && top_gap !== null && top_gap > 40) {
			return {
				key: "Compared with {other_move}, this move first tries to {current_idea}, while the alternative is more about trying to {other_idea}; that difference is worth about {delta}.",
				args: Object.assign(base_args, delta_args)
			};
		}

		if (top_gap !== null && top_gap >= 80 && delta_args) {
			return {
				key: "The gap to {other_move} is about {delta}, and the best line gets to {current_idea} more directly.",
				args: Object.assign(base_args, delta_args)
			};
		}

		return {
			key: "Compared with {other_move}, this move first tries to {current_idea}, while the alternative is more about trying to {other_idea}.",
			args: base_args
		};
	}

	if (!best || best.move === current.move) {
		return {
			key: "The engine has not searched this move deeply enough to compare it confidently.",
			args: null
		};
	}

	if (current.primary === "early_king") {
		let args = {
			best_move: best.nice_move,
			best_idea: idea_phrase_key(best.primary)
		};
		let delta_args = delta_args_for(bestInfo, info);

		if (delta_args) {
			return {
				key: "This walks the king out early, while {best_move} first tries to {best_idea}; that costs about {delta}.",
				args: Object.assign(args, delta_args)
			};
		}

		return {
			key: "This walks the king out early, while {best_move} first tries to {best_idea}.",
			args
		};
	}

	if (current.primary === "queen_early") {
		let args = {
			best_move: best.nice_move,
			best_idea: idea_phrase_key(best.primary)
		};
		let delta_args = delta_args_for(bestInfo, info);

		if (delta_args) {
			return {
				key: "This brings the queen out too soon, while {best_move} first tries to {best_idea}; that costs about {delta}.",
				args: Object.assign(args, delta_args)
			};
		}

		return {
			key: "This brings the queen out too soon, while {best_move} first tries to {best_idea}.",
			args
		};
	}

	if (current.primary === "slow_pawn") {
		let args = {
			best_move: best.nice_move,
			best_idea: idea_phrase_key(best.primary)
		};
		let delta_args = delta_args_for(bestInfo, info);

		if (delta_args) {
			return {
				key: "This spends a tempo on a flank pawn, while {best_move} first tries to {best_idea}; that costs about {delta}.",
				args: Object.assign(args, delta_args)
			};
		}

		return {
			key: "This spends a tempo on a flank pawn, while {best_move} first tries to {best_idea}.",
			args
		};
	}

	if (current.primary === best.primary) {
		if (delta_cp !== null && delta_cp <= 15) {
			return {
				key: "This is almost as good as the engine's first choice.",
				args: null
			};
		}

		if (delta_cp !== null && delta_cp <= 40) {
			let args = delta_args_for(bestInfo, info);
			if (args) {
				return {
					key: "Compared with {best_move}, this move follows the same plan but gives away about {delta}.",
					args: Object.assign({best_move: best.nice_move}, args)
				};
			}
			return {
				key: "Compared with {best_move}, this move follows the same plan but is a little less precise.",
				args: {best_move: best.nice_move}
			};
		}
	}

	let comparison_args = {
		current_idea: idea_phrase_key(current.primary),
		best_idea: idea_phrase_key(best.primary),
		best_move: best.nice_move
	};
	let delta_args = delta_args_for(bestInfo, info);

	if (delta_args) {
		if (delta_cp <= 40) {
			return {
				key: "This move is more about {current_idea}, while the engine would rather {best_idea} with {best_move}.",
				args: comparison_args
			};
		}

		if (best_value >= 120) {
			return {
				key: "This move is more about trying to {current_idea}, while {best_move} first tries to {best_idea}; that costs about {delta}.",
				args: Object.assign(comparison_args, delta_args)
			};
		}

		if (best_value <= -120) {
			return {
				key: "This move is more about trying to {current_idea}, but under pressure the engine prefers {best_move} to {best_idea}; that saves about {delta}.",
				args: Object.assign(comparison_args, delta_args)
			};
		}

		return {
			key: "This move is more about trying to {current_idea}, while the engine would rather {best_idea} with {best_move}; that costs about {delta}.",
			args: Object.assign(comparison_args, delta_args)
		};
	}

	return {
		key: "This move is more about trying to {current_idea}, while the engine would rather {best_idea} with {best_move}.",
		args: comparison_args
	};
}

function explain_unsearched_move(node, info, total_candidates) {
	let eval_object = format_eval_text(info);
	let move = info && typeof info.move === "string" ? info.move : "";
	let nice_move = move ? node.board.nice_string(move) : "?";

	return {
		move,
		nice_move,
		rank: 1,
		total_candidates,
		eval_text: eval_object.key,
		eval_args: eval_object.args,
		delta_from_best: null,
		summary_key: "This move is legal, but the engine has not searched it deeply yet.",
		summary_args: null,
		theme_keys: [],
		theme_args: [],
		pv_hint_key: "The idea is mainly positional: improve the pieces and keep the same plan.",
		pv_hint_args: null,
		comparison_key: "The engine has not searched this move deeply enough to compare it confidently.",
		comparison_args: null,
		reply_summary_key: null,
		reply_summary_args: null,
		reply_theme_key: null,
		reply_theme_args: null,
		reply_note_key: null,
		reply_note_args: null,
		why_not_label_key: "Why this falls short",
		why_not_reason_label_keys: [],
		why_not_reason_text_keys: [],
		why_not_reason_args: [],
		coach_metric_label_keys: [],
		coach_metric_text_keys: [],
		coach_metric_args: [],
		coach_keys: [],
		coach_args: [],
		raw_tags: ["unsearched"]
	};
}

function explainMove({node, info, bestInfo, secondInfo, infoList}, internal = false) {
	let info_list = Array.isArray(infoList) ? infoList : [info].filter(Boolean);
	let total_candidates = info_list.length || 1;

	if (!info) {
		return explain_unsearched_move(node, info, total_candidates);
	}

	let board = node.board;
	let board_after = board.move(info.move);
	let eval_object = format_eval_text(info);
	let rank = Math.max(1, info_list.findIndex(o => o.move === info.move) + 1);
	let touched = !!info.__touched;
	let best_reference = (bestInfo && bestInfo.__touched) ? bestInfo : (touched ? info : null);
	let best_value = best_reference ? score_value(best_reference) : 0;
	let delta_cp = (touched && best_reference) ? Math.abs(best_value - score_value(info)) : null;
	let top_gap = (best_reference && secondInfo && secondInfo.__touched) ? Math.abs(best_value - score_value(secondInfo)) : null;
	let capture = capture_info(board, info.move);
	let check = king_checked_after(board_after, board.active);
	let mate = check && board_after.no_moves();
	let central_pawn = central_pawn_info(board, info.move);
	let threat = fresh_attack_target(board, board_after);
	let save_piece = save_piece_info(board, board_after, info.move);
	let king_activity = king_activity_info(board, info.move);
	let early_king = early_king_move_info(board, board_after, info.move);
	let queen_early = early_queen_move_info(board, info.move);
	let slow_opening = slow_opening_move_info(board, info.move, capture, threat, central_pawn);
	let rook_file = rook_file_state(board_after, info.move);
	let themes = [];
	let raw_tags = [];
	let seen = new Set();
	let mover = board.active;
	let moved = moved_piece(board, info.move);
	let landing = landing_square(board, info.move);
	let before_profile = strategic_profile(board, mover);
	let immediate_after_profile = strategic_profile(board_after, mover);
	let current_line = line_features(board, info);
	let immediate_tactics = current_line.tactics || [];
	let immediate_structure = current_line.structure || null;

	if (mate) {
		push_theme(themes, raw_tags, seen, "It starts a forcing mating sequence.", null, "mate");
	}
	if (board.king_in_check()) {
		push_theme(themes, raw_tags, seen, "It gets the king out of check and stabilizes the position.", null, "escape_check");
	}
	if (check) {
		push_theme(themes, raw_tags, seen, "It gives check and forces an immediate reply.", null, "check");
	}
	if (info.move.length === 5) {
		push_theme(themes, raw_tags, seen, "It promotes the pawn and transforms the position immediately.", null, "promotion");
	}
	if (capture) {
		if (is_recapture(node, capture)) {
			push_theme(themes, raw_tags, seen, "It recaptures on {square} and restores material balance.", {square: capture.square}, "recapture");
		} else {
			push_theme(themes, raw_tags, seen, "It wins material by capturing a {piece}.", {piece: piece_name(capture.piece)}, "capture");
		}
	}
	for (let motif of immediate_tactics.slice(0, 2)) {
		push_theme(themes, raw_tags, seen, motif.key, motif.args, motif.tag);
	}
	if (save_piece) {
		push_theme(themes, raw_tags, seen, "It moves a loose piece away from danger and reduces tactical risk.", null, "save_piece");
	}
	if (threat) {
		if (threat.undefended) {
			push_theme(themes, raw_tags, seen, "It hits an undefended {piece}, so tactics may follow.", {piece: piece_name(threat.piece)}, "threat");
		} else {
			push_theme(themes, raw_tags, seen, "It hits the enemy {piece} and creates a concrete threat.", {piece: piece_name(threat.piece)}, "threat");
		}
	}
	if (is_castling_move(board, info.move)) {
		push_theme(themes, raw_tags, seen, "It castles to improve king safety and connect the rooks.", null, "castle");
	}
	if (early_king) {
		if (early_king.loses_castling) {
			push_theme(themes, raw_tags, seen, "It brings the king out early and gives up castling rights, which is usually a serious opening concession.", null, "early_king");
		} else {
			push_theme(themes, raw_tags, seen, "It brings the king out early, which is usually risky before development is complete.", null, "early_king");
		}
	}
	if (queen_early) {
		push_theme(themes, raw_tags, seen, "It develops the queen very early, so the opponent may gain time by attacking it.", null, "queen_early");
	}
	if (is_development_move(board, info.move)) {
		if (development_supports_castling(board, info.move)) {
			push_theme(themes, raw_tags, seen, "It improves castling chances by finishing a useful developing move.", null, "development");
		} else {
			push_theme(themes, raw_tags, seen, "It develops a minor piece to a more active square.", null, "development");
		}
	}
	if (central_pawn) {
		push_theme(themes, raw_tags, seen, "It claims central space with a pawn and asks the opponent how they want to react.", null, "center_pawn");
	}
	if (slow_opening) {
		push_theme(themes, raw_tags, seen, "It spends a tempo on a flank pawn and does little for development or central control.", null, "slow_pawn");
	}
	if (king_activity) {
		push_theme(themes, raw_tags, seen, "It activates the king toward the center, which is often important in the endgame.", null, "king_activity");
	}
	if (rook_file === "open") {
		push_theme(themes, raw_tags, seen, "It places a rook on an open file to increase pressure.", null, "open_file");
	} else if (rook_file === "half-open") {
		push_theme(themes, raw_tags, seen, "It puts a rook on a half-open file where it can lean on the enemy camp.", null, "half_open_file");
	}
	if (is_passed_pawn(board_after, info.move)) {
		push_theme(themes, raw_tags, seen, "It advances a passed pawn and asks endgame questions.", null, "passed_pawn");
	}
	if ((moved === "P" || moved === "p" || capture) && immediate_after_profile.pawn_structure.score >= before_profile.pawn_structure.score + 0.8) {
		push_theme(themes, raw_tags, seen, "It secures a healthier pawn structure, with fewer long-term pawn weaknesses.", null, "pawn_structure");
	}
	if ((moved === "N" || moved === "n") && landing && immediate_after_profile.knight.best_outpost === landing.s && immediate_after_profile.knight.outpost_score > before_profile.knight.outpost_score) {
		push_theme(themes, raw_tags, seen, "It plants a knight on a durable outpost at {square}, using a weak square the pawns cannot easily challenge.", {
			square: landing.s
		}, "outpost");
	} else if ((moved === "N" || moved === "n") && immediate_after_profile.knight.score >= before_profile.knight.score + 0.8) {
		push_theme(themes, raw_tags, seen, "It improves the knight's long-term square and makes it harder to challenge.", null, "knight_quality");
	}
	if ((moved === "B" || moved === "b" || moved === "P" || moved === "p") && immediate_after_profile.bishop.score >= before_profile.bishop.score + 0.4) {
		push_theme(themes, raw_tags, seen, "It improves the bishop relative to the pawn chain, so the minor pieces fit the structure better.", null, "bishop_quality");
	}
	if (immediate_structure && immediate_structure.name && immediate_structure.score >= 0.7 && immediate_structure.theme_key) {
		push_theme(themes, raw_tags, seen, immediate_structure.theme_key, null, immediate_structure.tag);
	}
	if (simplifies_ahead(best_value, capture)) {
		push_theme(themes, raw_tags, seen, "With the better position, it simplifies into a cleaner game.", null, "simplify");
	}
	if ((capture || current_line.remaining_material <= total_material(board) - 2 || is_endgame(current_line.snapshot.board)) && current_line.endgame_comfort >= 1.2) {
		push_theme(themes, raw_tags, seen, "The resulting structure points toward a more comfortable endgame if pieces come off.", null, "endgame_direction");
	}
	if (best_value <= -120 && (rank === 1 || (delta_cp !== null && delta_cp <= 40) || board.king_in_check())) {
		push_theme(themes, raw_tags, seen, "It is a stubborn defensive resource that keeps the game going.", null, "defense");
	}
	if (themes.length === 0) {
		push_theme(themes, raw_tags, seen, "It mainly improves piece placement without changing the structure.", null, "quiet");
	}

	let primary = primary_tag(raw_tags);
	let summary_key = summary_key_for(primary, rank, best_value, delta_cp, top_gap, mate, touched);
	let nice_line = nice_pv(board, info).slice(1, 4).join(" ");
	let pv_hint_key = pv_hint_key_for(primary, !!nice_line);
	let comparison = {
		key: "The engine has not produced a meaningful alternative yet.",
		args: null
	};
	let reply_preview = null;
	let why_not_reasons = [];
	let coach_metrics = [];
	let coach_notes = [];

	if (!internal) {
		let best_explanation = null;
		let rival_explanation = null;

		if (bestInfo && bestInfo.move !== info.move) {
			best_explanation = explainMove({
				node,
				info: bestInfo,
				bestInfo,
				secondInfo: null,
				infoList: info_list
			}, true);
		}

		if (rank === 1 && secondInfo && secondInfo.move !== info.move) {
			rival_explanation = explainMove({
				node,
				info: secondInfo,
				bestInfo,
				secondInfo: null,
				infoList: info_list
			}, true);
		}

		comparison = comparison_for({
			current: {
				move: info.move,
				nice_move: board.nice_string(info.move),
				primary,
				touched,
				rank
			},
			best: best_explanation,
			rival: rival_explanation,
			bestInfo,
			info,
			best_value,
			delta_cp,
			top_gap
		});

		let coach_target_info = rank === 1 ? secondInfo : (bestInfo && bestInfo.move !== info.move ? bestInfo : null);
		let coach_target_primary = null;

		if (rank === 1 && rival_explanation) {
			coach_target_primary = rival_explanation.primary;
		} else if (rank !== 1 && best_explanation) {
			coach_target_primary = best_explanation.primary;
		}

		coach_notes = coach_notes_for({
			board,
			currentInfo: info,
			targetInfo: coach_target_info,
			currentPrimary: primary,
			targetPrimary: coach_target_primary,
			currentRank: rank
		});

		coach_metrics = coach_metrics_for({
			board,
			currentInfo: info,
			targetInfo: coach_target_info,
			currentPrimary: primary,
			targetPrimary: coach_target_primary,
			currentRank: rank
		});

		reply_preview = reply_preview_for({
			board,
			info,
			currentPrimary: primary,
			currentRank: rank,
			touched
		});

		why_not_reasons = why_not_reasons_for({
			board,
			currentInfo: info,
			targetInfo: coach_target_info,
			currentPrimary: primary,
			targetPrimary: coach_target_primary,
			currentRank: rank,
			replyPreview: reply_preview
		});
	}

	return {
		move: info.move,
		nice_move: board.nice_string(info.move),
		rank,
		total_candidates,
		eval_text: eval_object.key,
		eval_args: eval_object.args,
		delta_from_best: rank === 1 ? 0 : delta_cp,
		summary_key,
		summary_args: null,
		theme_keys: themes.map(theme => theme.key),
		theme_args: themes.map(theme => theme.args),
		pv_hint_key,
		pv_hint_args: nice_line ? {pv: nice_line} : null,
		comparison_key: comparison.key,
		comparison_args: comparison.args,
		reply_summary_key: reply_preview ? reply_preview.summary_key : null,
		reply_summary_args: reply_preview ? reply_preview.summary_args : null,
		reply_theme_key: reply_preview ? reply_preview.theme_key : null,
		reply_theme_args: reply_preview ? reply_preview.theme_args : null,
		reply_note_key: reply_preview ? reply_preview.note_key : null,
		reply_note_args: reply_preview ? reply_preview.note_args : null,
		why_not_label_key: rank === 1 ? "Why the alternatives fall short" : "Why this falls short",
		why_not_reason_label_keys: why_not_reasons.map(reason => reason.label_key),
		why_not_reason_text_keys: why_not_reasons.map(reason => reason.text_key),
		why_not_reason_args: why_not_reasons.map(reason => reason.args),
		coach_metric_label_keys: coach_metrics.map(metric => metric.label_key),
		coach_metric_text_keys: coach_metrics.map(metric => metric.text_key),
		coach_metric_args: coach_metrics.map(metric => metric.args),
		coach_keys: coach_notes.map(note => note.key),
		coach_args: coach_notes.map(note => note.args),
		raw_tags,
		primary,
		touched,
		source_info: info
	};
}

function interpolate(template, args) {
	if (typeof template !== "string" || !args) {
		return template;
	}

	let rendered = template;

	for (let [key, value] of Object.entries(args)) {
		rendered = rendered.split(`{${key}}`).join(value);
	}

	return rendered;
}

function renderExplanation(explanation, translate_fn) {
	let translate = make_translate_helper(translate_fn);

	return {
		title: translate("Move explanation"),
		rank_line: translate("Candidate {rank} of {total}", {
			rank: explanation.rank.toString(),
			total: explanation.total_candidates.toString()
		}),
		eval_line: translate("Eval {eval}", {
			eval: translate(explanation.eval_text, explanation.eval_args)
		}),
		key_ideas_label: translate("Key ideas"),
		main_idea_label: translate("Main idea"),
		reply_label: translate("Likely reply"),
		why_not_label: translate(explanation.why_not_label_key),
		coach_label: translate("Coach view"),
		comparison_label: translate("Comparison"),
		summary: translate(explanation.summary_key, explanation.summary_args),
		themes: explanation.theme_keys.map((key, index) => translate(key, explanation.theme_args[index])),
		pv_hint: translate(explanation.pv_hint_key, explanation.pv_hint_args),
		reply_summary: explanation.reply_summary_key ? translate(explanation.reply_summary_key, explanation.reply_summary_args) : "",
		reply_theme: explanation.reply_theme_key ? translate(explanation.reply_theme_key, explanation.reply_theme_args) : "",
		reply_note: explanation.reply_note_key ? translate(explanation.reply_note_key, explanation.reply_note_args) : "",
		why_not_reasons: (explanation.why_not_reason_label_keys || []).map((label_key, index) => ({
			label: translate(label_key),
			text: translate((explanation.why_not_reason_text_keys || [])[index], (explanation.why_not_reason_args || [])[index])
		})),
		coach_metrics: (explanation.coach_metric_label_keys || []).map((label_key, index) => ({
			label: translate(label_key),
			text: translate((explanation.coach_metric_text_keys || [])[index], (explanation.coach_metric_args || [])[index])
		})),
		coach_notes: (explanation.coach_keys || []).map((key, index) => translate(key, explanation.coach_args[index])),
		comparison: translate(explanation.comparison_key, explanation.comparison_args),
	};
}

function make_translate_helper(translate_fn) {
	return (key, args) => {
		let translated_key = translate_fn(key) || key;
		let translated_args = null;
		let should_translate_args = translated_key !== key;

		if (args) {
			translated_args = Object.create(null);
			for (let [name, value] of Object.entries(args)) {
				if (typeof value === "string") {
					if (should_translate_args) {
						let translated_value = translate_fn(value);
						translated_args[name] = translated_value || value;
					} else {
						translated_args[name] = value;
					}
				} else {
					translated_args[name] = value;
				}
			}
		}

		return interpolate(translated_key, translated_args);
	};
}

function learning_status_for_explanation(explanation) {
	let tags = new Set(explanation.raw_tags || []);
	let delta = typeof explanation.delta_from_best === "number" ? explanation.delta_from_best : null;
	let positive_tags = ["development", "center_pawn", "castle", "save_piece", "threat", "open_file", "half_open_file", "passed_pawn", "king_activity", "simplify", "defense", "pawn_structure", "outpost", "bishop_quality", "knight_quality", "endgame_direction", "fork", "pin", "skewer", "discovered_attack", "back_rank", "trapped_piece", "structure_iqp", "structure_hanging_pawns", "structure_carlsbad", "structure_closed_center", "structure_benoni", "structure_colour_complex"];
	let severe_tags = ["early_king", "queen_early"];

	if (explanation.touched) {
		if (explanation.rank === 1 || (delta !== null && delta <= 35)) {
			return {key: "Acceptable", tone: "good"};
		}
		if (severe_tags.some(tag => tags.has(tag)) || (delta !== null && delta >= 120)) {
			return {key: "Clear concession", tone: "bad"};
		}
		return {key: "Dubious", tone: "warning"};
	}

	if (severe_tags.some(tag => tags.has(tag))) {
		return {key: "Clear concession", tone: "bad"};
	}
	if (positive_tags.some(tag => tags.has(tag))) {
		return {key: "Acceptable", tone: "good"};
	}
	return {key: "Dubious", tone: "warning"};
}

function buildLearningFeedback({node, info, bestInfo, secondInfo, infoList}) {
	if (!node || !info) {
		return null;
	}

	let explanation = explainMove({
		node,
		info,
		bestInfo,
		secondInfo,
		infoList
	});

	let status = learning_status_for_explanation(explanation);
	let best_explanation = null;

	if (bestInfo && bestInfo.move && bestInfo.move !== explanation.move) {
		best_explanation = explainMove({
			node,
			info: bestInfo,
			bestInfo,
			secondInfo,
			infoList
		}, true);
	}

	let issue_label_key = (explanation.why_not_reason_text_keys || []).length > 0 ? "Main issue" : "Main idea";
	let issue_text_key = (explanation.why_not_reason_text_keys || [])[0] || explanation.pv_hint_key;
	let issue_args = (explanation.why_not_reason_args || [])[0] || explanation.pv_hint_args || null;
	let better_text_key = null;
	let better_args = null;

	if (best_explanation && best_explanation.move !== explanation.move) {
		better_text_key = "A cleaner plan was {best_move}: first {best_idea}.";
		better_args = {
			best_move: best_explanation.nice_move,
			best_idea: idea_phrase_key(best_explanation.primary)
		};
	}

	let reply_text_key = explanation.reply_summary_key || explanation.reply_note_key || null;
	let reply_args = explanation.reply_summary_key ? explanation.reply_summary_args : explanation.reply_note_args;
	let note_text_key = explanation.touched ? null : "The engine has not searched this move deeply yet, so this is a first-pass judgement.";

	return {
		signature: `${node.id}|${explanation.move}|${status.key}|${status.tone}|${explanation.touched ? 1 : 0}|${explanation.delta_from_best === null ? "?" : explanation.delta_from_best}|${(explanation.raw_tags || []).join(",")}`,
		move: explanation.move,
		nice_move: explanation.nice_move,
		title_key: "Learning feedback",
		move_label_key: "Your move",
		status_key: status.key,
		status_tone: status.tone,
		summary_key: explanation.summary_key,
		summary_args: explanation.summary_args,
		issue_label_key,
		issue_text_key,
		issue_args,
		better_label_key: better_text_key ? "Better idea" : null,
		better_text_key,
		better_args,
		reply_label_key: reply_text_key ? "Likely reply" : null,
		reply_text_key,
		reply_args,
		note_label_key: note_text_key ? "Search note" : null,
		note_text_key,
		note_args: null
	};
}

function renderLearningFeedback(feedback, translate_fn) {
	if (!feedback) {
		return null;
	}

	let translate = make_translate_helper(translate_fn);

	return {
		title: translate(feedback.title_key),
		move_label: translate(feedback.move_label_key),
		move: feedback.nice_move,
		status: translate(feedback.status_key),
		status_tone: feedback.status_tone || "warning",
		summary: translate(feedback.summary_key, feedback.summary_args),
		issue_label: feedback.issue_label_key ? translate(feedback.issue_label_key) : "",
		issue_text: feedback.issue_text_key ? translate(feedback.issue_text_key, feedback.issue_args) : "",
		better_label: feedback.better_label_key ? translate(feedback.better_label_key) : "",
		better_text: feedback.better_text_key ? translate(feedback.better_text_key, feedback.better_args) : "",
		reply_label: feedback.reply_label_key ? translate(feedback.reply_label_key) : "",
		reply_text: feedback.reply_text_key ? translate(feedback.reply_text_key, feedback.reply_args) : "",
		note_label: feedback.note_label_key ? translate(feedback.note_label_key) : "",
		note_text: feedback.note_text_key ? translate(feedback.note_text_key, feedback.note_args) : ""
	};
}

module.exports = {
	explainMove,
	renderExplanation,
	buildLearningFeedback,
	renderLearningFeedback,
};
