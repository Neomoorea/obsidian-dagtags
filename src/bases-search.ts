import { App, BasesEntry, QueryController } from "obsidian";
import { filterByTerms, planBasesQuery } from "./bases-query";
import { IssueReporter } from "./issues";
import { tagsOfFile } from "./tags";

/**
 * Bases has no public search API, so this is the one place DAGtags leans on an Obsidian internal.
 *
 * What it relies on, observed in Obsidian 1.14 and feature-detected at runtime:
 *   - `QueryController` is exported publicly and is the class behind every base: a .base tab,
 *     an embedded ![[x.base]] and an inline ```base block.
 *   - The search bar stores its text in `controller.searchQuery`, and `applySearchQuery(entries,
 *     visibleProperties)` filters the rows before any view (table, cards, list, kanban, third-party)
 *     receives them.
 *
 * We wrap that method on the prototype. For a query that holds DAGtags patterns we filter the rows by
 * tag, then call the original with the leftover text so Bases' own matching keeps working. Anything
 * else goes straight to the original. If this stops working, Bases search simply behaves natively.
 */
interface SearchHost {
	searchQuery: string | null | undefined;
}
type ApplySearchQuery = (this: SearchHost, entries: BasesEntry[], visibleProperties: unknown) => BasesEntry[];

/** Returns a function that removes the wrapper again, or null if this Obsidian has no Bases search to wrap. */
export function installBasesSearch(app: App, reporter: IssueReporter): (() => void) | null {
	const controller = QueryController as unknown as { prototype?: Record<string, unknown> } | undefined;
	const proto = controller?.prototype;

	if (!proto) {
		// Obsidian older than 1.10: no Bases at all. Nothing to do and nothing to warn about.
		console.debug("DAGtags: Bases is not available in this version of Obsidian.");
		return null;
	}
	if (typeof proto.applySearchQuery !== "function") {
		console.warn("DAGtags: could not find the Bases search method. Wildcards will not work in Bases search.");
		return null;
	}

	const native = proto.applySearchQuery as ApplySearchQuery;
	let active = true;
	let reportedFailure = false;

	const prepare = (query: string | null | undefined, entries: BasesEntry[]) => {
		if (typeof query !== "string" || !query.includes("*") || !Array.isArray(entries)) {
			reporter.clear();
			return null;
		}

		const plan = planBasesQuery(query);
		if (plan.terms.length === 0) {
			reporter.update({ invalid: plan.invalid, unmatched: [] });
			return null;
		}

		const { kept, hits } = filterByTerms(entries, plan.terms, (entry) => tagsOfFile(app, entry.file));
		reporter.update({ invalid: plan.invalid, unmatched: plan.terms.filter((_, i) => hits[i] === 0) });
		return { entries: kept, residual: plan.residual };
	};

	const patched: ApplySearchQuery = function (this: SearchHost, entries, visibleProperties) {
		if (!active) return native.call(this, entries, visibleProperties);

		let prepared: ReturnType<typeof prepare> = null;
		try {
			prepared = prepare(this.searchQuery, entries);
		} catch (err) {
			// Never let a bug of ours break Bases: fall back to the untouched native search.
			if (!reportedFailure) {
				reportedFailure = true;
				console.error("DAGtags: wildcard search failed, falling back to the native Bases search.", err);
			}
		}
		if (!prepared) return native.call(this, entries, visibleProperties);

		// The native method reads its query from the host, so lend it only the leftover text.
		const original = this.searchQuery;
		this.searchQuery = prepared.residual;
		try {
			return native.call(this, prepared.entries, visibleProperties);
		} finally {
			this.searchQuery = original;
		}
	};

	proto.applySearchQuery = patched;

	return () => {
		active = false;
		// If another plugin wrapped the method after us we cannot unpick ourselves, so the wrapper stays but is inert.
		if (proto.applySearchQuery === patched) proto.applySearchQuery = native;
	};
}
