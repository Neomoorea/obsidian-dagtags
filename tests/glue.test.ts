import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<div class="workspace-leaf-content" data-type="search"><div class="search-input-container"><input type="text"></div></div>
<div class="workspace-leaf-content" data-type="markdown"><input id="other" type="text"></div>`);
(globalThis as any).document = dom.window.document;
(globalThis as any).Event = dom.window.Event;
(globalThis as any).__app = {
	vault: { getMarkdownFiles: () => [{ n: 1 }, { n: 2 }, { n: 3 }] },
	metadataCache: { getFileCache: (f: any) => ({ tags: [[{ tag: "#A/B" }], [{ tag: "#C/B" }], [{ tag: "#D/B/F" }]][f.n - 1] }) },
	workspace: { on: () => ({}), getLeavesOfType: () => [] },
};

import Plugin from "../src/main";
import { notices } from "./obsidian-mock";

const press = (el: Element) => {
	const e = new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
	el.dispatchEvent(e);
};

test("Enter in the search field rewrites the value BEFORE obsidian's own handler runs", async () => {
	const p: any = new (Plugin as any)();
	await p.onload();
	const input = dom.window.document.querySelector(".search-input-container input") as HTMLInputElement;

	let valueSeenByObsidianHandler = "";
	let inputEventFired = false;
	input.addEventListener("keydown", () => { valueSeenByObsidianHandler = input.value; }); // stands in for Obsidian's handler
	input.addEventListener("input", () => { inputEventFired = true; });

	input.value = "tag:#*/B";
	press(input);
	assert.equal(valueSeenByObsidianHandler, "(tag:#A/B OR tag:#C/B)");
	assert.ok(inputEventFired, "an input event must be dispatched so the search component re-reads the field");
});

test("inputs outside the search pane are never touched", async () => {
	const other = dom.window.document.getElementById("other") as HTMLInputElement;
	other.value = "tag:#*/B";
	press(other);
	assert.equal(other.value, "tag:#*/B");
});

test("no match produces a notice and leaves the field alone", async () => {
	const input = dom.window.document.querySelector(".search-input-container input") as HTMLInputElement;
	input.value = "tag:#*/zzz";
	press(input);
	assert.equal(input.value, "tag:#*/zzz");
	assert.ok(notices.some((n) => n.includes("no tag matches")));
});
