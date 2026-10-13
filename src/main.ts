import { Notice, Plugin } from "obsidian";
import { installBasesSearch } from "./bases-search";
import { expandQuery } from "./expand";
import { IssueReporter } from "./issues";
import { collectVaultTags } from "./tags";

/**
 * Search pane: only public API plus two DOM selectors are used, nothing is patched. If Obsidian
 * renames these classes in future, it degrades to doing nothing (the command below is a manual fallback).
 *
 * Bases: see bases-search.ts, which wraps one internal method and explains why.
 */
const SEARCH_FIELD = '.workspace-leaf-content[data-type="search"] .search-input-container';

export default class DagTagsPlugin extends Plugin {
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

		// Bases search bar: filters live, so there is no Enter key to hook.
		const reporter = new IssueReporter(this.app);
		this.register(() => reporter.dispose());
		const uninstall = installBasesSearch(this.app, reporter);
		if (uninstall) this.register(uninstall);
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

		const result = expandQuery(before, collectVaultTags(this.app));

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
}
