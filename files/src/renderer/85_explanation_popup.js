"use strict";

const { ipcRenderer } = require("electron");

const root = document.getElementById("popup_root");

ipcRenderer.on("set_explanation_popup", (event, payload) => {
	if (!payload || typeof payload !== "object") {
		document.title = "Move explanation";
		root.innerHTML = "";
		return;
	}

	document.title = payload.title || "Move explanation";
	root.innerHTML = typeof payload.html === "string" ? payload.html : "";
});

document.body.addEventListener("mouseenter", () => {
	ipcRenderer.send("explanation_popup_hover", true);
});

document.body.addEventListener("mouseleave", () => {
	ipcRenderer.send("explanation_popup_hover", false);
});

window.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		window.close();
	}
});

window.addEventListener("beforeunload", () => {
	ipcRenderer.send("explanation_popup_hover", false);
});
