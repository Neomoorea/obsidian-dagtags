/**
 * Search-pane logic: rewrites tag wildcards into native `tag:` searches.
 * No Obsidian imports, so it can be tested in Node. The pattern grammar lives in glob.ts.
 *
 * Native `tag:#x` already includes descendants (#x/y), so the expansion drops any
 * matched tag whose ancestor is also matched: it adds nothing and only lengthens the query.
 */

import { compilePattern, matchesTag, parsePatternToken, scanQuery } from "./glob";

export interface ExpandResult {
	/** The rewritten query. Identical to the input when nothing was expanded. */
	query: string;
	expanded: { token: string; tags: string[] }[];
	/** Well-formed patterns that matched no tag in the vault. */
	unmatched: string[];
	/** Malformed patterns (empty segments, e.g. a trailing slash). */
	invalid: string[];
}

/** Drop tags that already have an ancestor in the list (native tag: covers descendants). */
function dropDescendants(tags: string[]): string[] {
	const lower = new Set(tags.map((t) => t.toLowerCase()));
	return tags.filter((tag) => {
		const parts = tag.toLowerCase().split("/");
		for (let n = 1; n < parts.length; n++) {
			if (lower.has(parts.slice(0, n).join("/"))) return false;
		}
		return true;
	});
}

function render(tags: string[], negated: boolean): string {
	if (negated) return tags.map((t) => `-tag:#${t}`).join(" ");
	if (tags.length === 1) return `tag:#${tags[0]}`;
	return `(${tags.map((t) => `tag:#${t}`).join(" OR ")})`;
}

/**
 * @param query    The raw text of the search field.
 * @param allTags  Every tag in the vault, WITHOUT the leading "#".
 */
export function expandQuery(query: string, allTags: string[]): ExpandResult {
	const result: ExpandResult = { query, expanded: [], unmatched: [], invalid: [] };
	if (!query.includes("*")) return result;

	let out = "";

	for (const part of scanQuery(query)) {
		if (part.kind === "verbatim") {
			out += part.text;
			continue;
		}

		const token = part.text;
		const parsed = parsePatternToken(token);
		if (!parsed) {
			out += token;
			continue;
		}

		const segments = compilePattern(parsed.pattern);
		if (!segments) {
			result.invalid.push(token);
			out += token;
			continue;
		}

		const matches = allTags
			.filter((tag) => matchesTag(segments, tag.split("/")))
			.sort((a, b) => a.localeCompare(b));
		const tags = dropDescendants(matches);

		if (tags.length === 0) {
			result.unmatched.push(token);
			out += token;
			continue;
		}

		result.expanded.push({ token, tags });
		out += render(tags, parsed.negated);
	}

	result.query = out;
	return result;
}
