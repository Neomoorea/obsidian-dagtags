import { App, Notice } from "obsidian";
import { type BasesTerm } from "./bases-query";
import { matchesTag } from "./glob";
import { collectVaultTags } from "./tags";

export interface BasesIssues {
	/** Malformed pattern tokens. */
	invalid: string[];
	/** Terms that matched no tag on any row of the current view. Checked against the whole vault before reporting. */
	unmatched: BasesTerm[];
}

/**
 * The Bases search runs on every keystroke, and half-typed patterns (one that currently ends in a
 * slash, say) are normal while typing. So problems are only reported once the user has paused,
 * and each one only once for as long as it stays unresolved.
 */
export class IssueReporter {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private readonly shown = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly delayMs = 800,
	) {}

	update(issues: BasesIssues): void {
		this.cancel();
		if (issues.invalid.length === 0 && issues.unmatched.length === 0) {
			this.shown.clear();
			return;
		}
		this.timer = setTimeout(() => this.flush(issues), this.delayMs);
	}

	/** The search was emptied or no longer uses wildcards. */
	clear(): void {
		this.cancel();
		this.shown.clear();
	}

	dispose(): void {
		this.cancel();
	}

	private cancel(): void {
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
	}

	private flush(issues: BasesIssues): void {
		this.timer = null;
		const messages = new Map<string, string>();

		for (const token of issues.invalid) {
			messages.set(`invalid:${token}`, `DAGtags: malformed pattern ${token} (empty segment, e.g. trailing "/")`);
		}

		if (issues.unmatched.length > 0) {
			// A pattern can match nothing in this view yet be fine. Only complain if no tag in the vault fits it.
			const vaultTags = collectVaultTags(this.app).map((tag) => tag.split("/"));
			for (const term of issues.unmatched) {
				if (!vaultTags.some((path) => matchesTag(term.segments, path))) {
					messages.set(`unmatched:${term.token}`, `DAGtags: no tag matches ${term.token}`);
				}
			}
		}

		for (const key of [...this.shown]) {
			if (!messages.has(key)) this.shown.delete(key);
		}
		for (const [key, text] of messages) {
			if (this.shown.has(key)) continue;
			this.shown.add(key);
			new Notice(text);
		}
	}
}
