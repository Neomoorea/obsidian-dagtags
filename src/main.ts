import { Notice, Plugin, getAllTags } from "obsidian";
import { expandQuery } from "./expand";

/**
 * Only public API plus two DOM selectors are used. No Obsidian internals are patched.
 * If Obsidian renames these classes in future, the plugin degrades to doing nothing
 * (the command below is a manual fallback).
 */
const SEARCH_FIELD = '.workspace-leaf-content[data-type="search"] .search-input-container';

export default class TagGlobSearchPlugin extends Plugin {
	async onload() {
		// Capture phase: we must rewrite the field BEFORE Obsidian's own Enter handler reads it.
		this.registerDomEvent(document, "keydown", this.onKeydown, { capture: true });

		// Pop-out windows have their own document.
		this.registerEvent(
			this.app.workspace.on("window-open", (_win, popoutWindow) => {
				this.registerDomEvent(popoutWindow.document, "keydown", this.onKeydown, { capture: true });
			}),
		);

		this.addCommand({
			id: "expand-tag-wildcards",
			name: "Expand tag wildcards in the search field",
			callback: () => {
				const leaf = this.app.workspace.getLeavesOfType("search")[0];
				const input = leaf?.view.containerEl.querySelector<HTMLInputElement>(".search-input-container input");
				if (!input) {
					new Notice("DAGtags: open the search pane first.");
					return;
				}
				if (!this.expandInput(input)) {
					new Notice("DAGtags: no tag wildcard found in the search field.");
				}
			},
		});
	}

	private onKeydown = (evt: KeyboardEvent): void => {
		if (evt.key !== "Enter" || evt.isComposing) return;

		// tagName rather than instanceof: instanceof breaks across pop-out windows.
		const target = evt.target as HTMLElement | null;
		if (!target || target.tagName !== "INPUT") return;
		if (!target.closest(SEARCH_FIELD)) return;

		this.expandInput(target as HTMLInputElement);
	};

	/** Returns true if the field content was rewritten. */
	private expandInput(input: HTMLInputElement): boolean {
		const before = input.value;
		if (!before.includes("*")) return false;

		const result = expandQuery(before, this.collectTags());

		for (const token of result.unmatched) {
			new Notice(`DAGtags: no tag matches ${token}`);
		}
		for (const token of result.invalid) {
			new Notice(`DAGtags: malformed pattern ${token} (empty segment, e.g. trailing "/")`);
		}

		if (result.query === before) return false;

		input.value = result.query;
		// Make Obsidian's own search component notice the new value.
		input.dispatchEvent(new Event("input", { bubbles: true }));
		return true;
	}

	/**
	 * Every tag in the vault, without "#", de-duplicated case-insensitively.
	 * Built from the public metadata API, so inline AND frontmatter tags are included.
	 * Computed on demand (at Enter), so there is no cache to invalidate.
	 */
	private collectTags(): string[] {
		const seen = new Map<string, string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;
			for (const tag of getAllTags(cache) ?? []) {
				const key = tag.toLowerCase();
				if (!seen.has(key)) seen.set(key, tag.replace(/^#/, ""));
			}
		}
		return [...seen.values()];
	}
}
