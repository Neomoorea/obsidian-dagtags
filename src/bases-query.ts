/**
 * Bases-search logic. No Obsidian imports, so it can be tested in Node.
 *
 * Bases search is not Obsidian's search syntax: it splits the text into tokens and keeps a row
 * only if EVERY token is a substring of one of its displayed properties. There is no `tag:`,
 * no OR and no wildcard. So instead of rewriting the query (as the search pane does), DAGtags
 * takes its own pattern tokens out of the query, filters rows by their tags, and leaves the
 * rest of the text for Bases' own matcher.
 *
 * A pattern matches a note when one of the note's own tags matches it as a WHOLE tag. Unlike the
 * search pane, descendants are therefore not pulled in implicitly: add `/**` to include them.
 */

import { type Segment, compilePattern, matchesTag, parsePatternToken, scanQuery } from "./glob";

export interface BasesTerm {
	/** The token exactly as typed, including any `-`, `tag:` or `#` prefix. */
	token: string;
	negated: boolean;
	segments: Segment[];
}

export interface BasesPlan {
	/** Well-formed pattern tokens found in the query. Empty means "nothing for DAGtags to do". */
	terms: BasesTerm[];
	/** The query with every term removed: what Bases' own matcher should still see. */
	residual: string;
	/** Malformed patterns (empty segments, e.g. a trailing slash). Left in `residual`. */
	invalid: string[];
}

export function planBasesQuery(query: string): BasesPlan {
	const plan: BasesPlan = { terms: [], residual: query, invalid: [] };
	if (!query.includes("*")) return plan;

	let residual = "";
	for (const part of scanQuery(query)) {
		if (part.kind === "verbatim") {
			residual += part.text;
			continue;
		}

		const parsed = parsePatternToken(part.text);
		if (!parsed) {
			residual += part.text;
			continue;
		}

		const segments = compilePattern(parsed.pattern);
		if (!segments) {
			plan.invalid.push(part.text);
			residual += part.text;
			continue;
		}

		plan.terms.push({ token: part.text, negated: parsed.negated, segments });
		residual += " ";
	}

	if (plan.terms.length > 0) plan.residual = residual.trim();
	return plan;
}

export interface FilterOutcome<E> {
	kept: E[];
	/** For each term, how many of the given entries carry a tag it matches (ignoring negation). */
	hits: number[];
}

/**
 * Keeps the entries that satisfy every term: carrying a matching tag for a plain term, and
 * carrying none for a negated one. Terms are combined with AND, like every Bases search token.
 */
export function filterByTerms<E>(
	entries: readonly E[],
	terms: readonly BasesTerm[],
	tagsOf: (entry: E) => string[],
): FilterOutcome<E> {
	const hits = terms.map(() => 0);
	const kept: E[] = [];

	for (const entry of entries) {
		const paths = tagsOf(entry).map((tag) => tag.split("/"));
		let keep = true;
		for (let i = 0; i < terms.length; i++) {
			const has = paths.some((path) => matchesTag(terms[i].segments, path));
			if (has) hits[i]++;
			if (has === terms[i].negated) keep = false;
		}
		if (keep) kept.push(entry);
	}

	return { kept, hits };
}
