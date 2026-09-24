/**
 * Pure logic for Tag Glob Search. No Obsidian imports, so it can be tested in Node.
 *
 * Grammar (applied to the tag path, segments separated by "/"):
 *   *    any characters inside ONE segment      (proj*  matches project, projects)
 *   **   ZERO or more whole segments            (only valid as a complete segment)
 *
 * A pattern must match the whole tag. Matching is case-insensitive, like Obsidian tags.
 * Native `tag:#x` already includes descendants (#x/y), so the expansion drops any
 * matched tag whose ancestor is also matched: it adds nothing and only lengthens the query.
 */

export interface ExpandResult {
	/** The rewritten query. Identical to the input when nothing was expanded. */
	query: string;
	expanded: { token: string; tags: string[] }[];
	/** Well-formed patterns that matched no tag in the vault. */
	unmatched: string[];
	/** Malformed patterns (empty segments, e.g. a trailing slash). */
	invalid: string[];
}

type Segment = { globstar: true } | { globstar: false; re: RegExp };

function escapeRegExp(s: string): string {
	return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function compileSegments(pattern: string): Segment[] | null {
	const parts = pattern.split("/");
	if (parts.some((p) => p === "")) return null;

	const segments: Segment[] = [];
	for (const part of parts) {
		if (part === "**") {
			// Consecutive globstars are equivalent to one.
			if (!(segments.length && segments[segments.length - 1].globstar)) {
				segments.push({ globstar: true });
			}
			continue;
		}
		const source = part.split(/\*+/).map(escapeRegExp).join("[^/]*");
		segments.push({ globstar: false, re: new RegExp(`^${source}$`, "iu") });
	}
	return segments;
}

function matchSegments(p: Segment[], t: string[], i = 0, j = 0): boolean {
	if (i === p.length) return j === t.length;
	const seg = p[i];
	if (seg.globstar) {
		for (let k = j; k <= t.length; k++) {
			if (matchSegments(p, t, i + 1, k)) return true;
		}
		return false;
	}
	return j < t.length && seg.re.test(t[j]) && matchSegments(p, t, i + 1, j + 1);
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

/** Recognises `tag:#pat`, `tag:pat`, `#pat`, each optionally preceded by `-`, and only if pat has a `*`. */
function parseToken(token: string): { negated: boolean; pattern: string } | null {
	const m = /^(-?)(?:tag:#?|#)(.+)$/i.exec(token);
	if (!m || !m[2].includes("*")) return null;
	return { negated: m[1] === "-", pattern: m[2] };
}

/**
 * @param query    The raw text of the search field.
 * @param allTags  Every tag in the vault, WITHOUT the leading "#".
 */
export function expandQuery(query: string, allTags: string[]): ExpandResult {
	const result: ExpandResult = { query, expanded: [], unmatched: [], invalid: [] };
	if (!query.includes("*")) return result;

	let out = "";
	let i = 0;
	const n = query.length;

	while (i < n) {
		const ch = query[i];

		// Whitespace and grouping characters delimit tokens.
		if (/\s/.test(ch) || ch === "(" || ch === ")") {
			out += ch;
			i++;
			continue;
		}

		// "quoted phrase": copy verbatim.
		if (ch === '"') {
			const close = query.indexOf('"', i + 1);
			const stop = close === -1 ? n : close + 1;
			out += query.slice(i, stop);
			i = stop;
			continue;
		}

		// /regex/ literal at the start of a token: copy verbatim.
		if (ch === "/") {
			let j = i + 1;
			while (j < n && query[j] !== "/") j += query[j] === "\\" ? 2 : 1;
			const stop = Math.min(j + 1, n);
			out += query.slice(i, stop);
			i = stop;
			continue;
		}

		let j = i;
		while (j < n && !/[\s()"]/.test(query[j])) j++;
		const token = query.slice(i, j);
		i = j;

		const parsed = parseToken(token);
		if (!parsed) {
			out += token;
			continue;
		}

		const segments = compileSegments(parsed.pattern);
		if (!segments) {
			result.invalid.push(token);
			out += token;
			continue;
		}

		const matches = allTags
			.filter((tag) => matchSegments(segments, tag.split("/")))
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
