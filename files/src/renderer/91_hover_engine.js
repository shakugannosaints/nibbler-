"use strict";

function NewHoverInfoHandler(manager) {

	let ih = Object.create(null);

	ih.manager = manager;
	ih.engine_cycle = 0;
	ih.engine_subcycle = 0;
	ih.temp_nodes = new Map();

	ih.search_key = function(node, move) {
		return `${node.id}|${move}`;
	};

	ih.begin_search = function(node, move) {
		this.temp_nodes.delete(this.search_key(node, move));
	};

	ih.ensure_temp_node = function(node, move) {
		let key = this.search_key(node, move);

		if (this.temp_nodes.has(key)) {
			return this.temp_nodes.get(key);
		}

		let temp_node = {
			id: `hover:${key}`,
			board: node.board,
			table: NewTable(),
			destroyed: false,
			move: node.move || null
		};

		this.temp_nodes.set(key, temp_node);
		return temp_node;
	};

	ih.receive = function(engine, search, s) {
		if (!search || !search.node || search.node.destroyed) {
			return;
		}

		let move = Array.isArray(search.searchmoves) ? search.searchmoves[0] : null;
		if (typeof move !== "string" || move.length < 4) {
			return;
		}

		let temp_node = this.ensure_temp_node(search.node, move);
		let fake_search = {
			node: temp_node,
			limit: search.limit
		};

		info_receiver_props.receive.call(this, engine, fake_search, s);

		let parsed = temp_node.table.moveinfo[move];
		if (parsed && parsed.__touched) {
			this.manager.store_live_result(search.node, move, parsed, temp_node.table);
		}
	};

	ih.err_receive = function(s) {
		this.manager.last_error = s;
	};

	return ih;
}

function NewHoverAnalysis(hub) {

	let hover = Object.create(null);

	hover.hub = hub;
	hover.cache = new Map();
	hover.last_error = null;
	hover.serial = 0;
	hover.pending_key = null;
	hover.pending_node = null;
	hover.pending_move = null;
	hover.pending_since = 0;
	hover.active_key = null;
	hover.active_node = null;
	hover.active_move = null;

	hover.adapter = {
		manager: hover,
		engine: null,
		info_handler: null,
		receive_bestmove: function(s, relevant_node) {
			this.manager.receive_bestmove(s, relevant_node);
		},
		receive_misc: function(s) {
			this.manager.receive_misc(s);
		},
		err_receive: function(s) {
			this.manager.err_receive(s);
		}
	};

	hover.adapter.info_handler = NewHoverInfoHandler(hover);
	hover.engine = NewEngine(hover.adapter, {suppress_acks: true, always_use_searchmoves: true});
	hover.adapter.engine = hover.engine;

	hover.cache_key = function(node, move) {
		if (!node || typeof move !== "string") {
			return null;
		}
		return `${node.id}|${move}`;
	};

	hover.bump_serial = function() {
		this.serial++;
		this.hub.info_handler.must_draw_explainbox();
	};

	hover.ensure_entry = function(node, move) {
		let key = this.cache_key(node, move);
		if (!key) {
			return null;
		}

		if (this.cache.has(key)) {
			return this.cache.get(key);
		}

		let entry = {
			key,
			node_id: node.id,
			move,
			status: "idle",
			info: null,
			version: 0,
			updated_at: 0
		};

		this.cache.set(key, entry);

		if (this.cache.size > Math.max(50, config.hover_eval_cache_limit || 400)) {
			this.cache.clear();
			this.cache.set(key, entry);
		}

		return entry;
	};

	hover.get_entry = function(node, move) {
		let key = this.cache_key(node, move);
		if (!key) {
			return null;
		}
		return this.cache.get(key) || null;
	};

	hover.get_info = function(node, move) {
		let entry = this.get_entry(node, move);
		return entry && entry.info ? entry.info : null;
	};

	hover.set_status = function(node, move, status) {
		let entry = this.ensure_entry(node, move);
		if (!entry || entry.status === status) {
			return entry;
		}

		entry.status = status;
		entry.updated_at = performance.now();
		this.bump_serial();
		return entry;
	};

	hover.clear_pending = function() {
		this.pending_key = null;
		this.pending_node = null;
		this.pending_move = null;
		this.pending_since = 0;
	};

	hover.clear_active = function() {
		this.active_key = null;
		this.active_node = null;
		this.active_move = null;
	};

	hover.clear_all = function(stop_engine = false) {
		this.cache.clear();
		this.clear_pending();
		this.clear_active();
		this.adapter.info_handler.temp_nodes.clear();
		this.last_error = null;
		if (stop_engine) {
			this.engine.set_search_desired(null);
		}
		this.bump_serial();
	};

	hover.start = function(filepath) {
		if (!filepath || typeof filepath !== "string" || fs.existsSync(filepath) === false) {
			return false;
		}

		let args = engineconfig[filepath] ? engineconfig[filepath].args : [];
		let new_engine = NewEngine(this.adapter, {suppress_acks: true, always_use_searchmoves: true});
		let success = new_engine.setup(filepath, args);

		if (!success) {
			return false;
		}

		this.engine.shutdown();
		this.engine = new_engine;
		this.adapter.engine = new_engine;
		this.clear_all(false);
		this.engine.send("uci");
		return true;
	};

	hover.shutdown = function() {
		this.engine.shutdown();
	};

	hover.receive_misc = function(s) {
		if (!this.engine) {
			return;
		}

		if (s.startsWith("id name")) {
			this.hub.configure_engine_identity(this.engine, s, false);
			return;
		}

		if (s.startsWith("uciok")) {
			this.hub.engine_send_all_options_to(this.engine, true);
			this.engine.send("isready");
			return;
		}

		if (s.startsWith("readyok")) {
			this.engine.send_ucinewgame();
			return;
		}
	};

	hover.receive_bestmove = function(s, relevant_node) {
		let completed = this.engine.search_completed;
		let move = (completed && Array.isArray(completed.searchmoves)) ? completed.searchmoves[0] : null;
		if (!relevant_node || typeof move !== "string") {
			this.clear_active();
			return;
		}

		let entry = this.ensure_entry(relevant_node, move);
		if (entry) {
			entry.status = entry.info ? "ready" : "idle";
			entry.updated_at = performance.now();
		}

		this.clear_active();
		this.bump_serial();
	};

	hover.err_receive = function(s) {
		this.last_error = s;
	};

	hover.store_live_result = function(node, move, info, table) {
		let entry = this.ensure_entry(node, move);
		if (!entry) {
			return;
		}

		entry.info = info;
		entry.info.__hover_source = true;
		entry.version++;
		entry.info.__hover_cache_version = entry.version;
		entry.info.__hover_table_time = table.time;
		entry.info.__hover_table_nodes = table.nodes;
		entry.status = "running";
		entry.updated_at = performance.now();
		this.bump_serial();
	};

	hover.launch = function(node, move) {
		if (!config.hover_eval_enabled || !this.engine.ever_received_uciok || !this.engine.ever_received_readyok) {
			return;
		}

		let entry = this.ensure_entry(node, move);
		if (!entry) {
			return;
		}

		let key = entry.key;

		if (this.active_key && this.active_key !== key) {
			let previous = this.cache.get(this.active_key);
			if (previous && previous.status === "running" && !previous.info) {
				previous.status = "idle";
			}
		}

		this.adapter.info_handler.begin_search(node, move);
		this.clear_pending();
		this.active_key = key;
		this.active_node = node;
		this.active_move = move;
		entry.status = "running";
		entry.updated_at = performance.now();
		this.bump_serial();
		this.engine.set_search_desired(node, config.hover_eval_movetime_ms, true, [move]);
	};

	hover.update = function(node, move, should_search) {
		if (!config.hover_eval_enabled || !config.show_explanation_panel) {
			this.clear_pending();
			return null;
		}

		if (!should_search || !node || node.destroyed || node.terminal_reason() || typeof move !== "string") {
			this.clear_pending();
			return null;
		}

		let entry = this.ensure_entry(node, move);
		if (!entry) {
			return null;
		}

		if (entry.info && entry.info.__touched) {
			this.clear_pending();
			if (entry.status !== "ready") {
				entry.status = "ready";
				entry.updated_at = performance.now();
				this.bump_serial();
			}
			return entry;
		}

		if (!this.engine.ever_received_uciok || !this.engine.ever_received_readyok) {
			return entry;
		}

		let now = performance.now();

		if (this.pending_key !== entry.key) {
			this.pending_key = entry.key;
			this.pending_node = node;
			this.pending_move = move;
			this.pending_since = now;
			if (entry.status !== "pending") {
				entry.status = "pending";
				entry.updated_at = now;
				this.bump_serial();
			}
			return entry;
		}

		if (this.active_key === entry.key && entry.status === "running") {
			return entry;
		}

		if (now - this.pending_since >= Math.max(50, config.hover_eval_delay_ms || 220)) {
			this.launch(node, move);
		}

		return entry;
	};

	hover.apply_main_option = function(name, value) {
		if (!this.engine || !this.engine.ever_received_uciok || !this.engine.known(name)) {
			return;
		}

		let low = name.toLowerCase();

		if (low === "multipv" || low === "threads" || low === "hash") {
			this.hub.apply_hover_engine_overrides(this.engine);
			return;
		}

		if (value === null || value === undefined) {
			value = "";
		}

		this.engine.setoption(name, value);
	};

	return hover;
}
