/**
 * Tag-pattern engine shared by the search pane (expand.ts) and Bases (bases-query.ts).
 * No Obsidian imports, so it can be tested in Node.
 *
 * Grammar (applied to the tag path, segments separated by "/"):
 *   *    any characters inside ONE segment      (proj*  matches project, projects)
 *   **   ZERO or more whole segments            (only valid as a complete segment)
 *
 * A pattern must match the whole tag. Matching is case-insensitive, like Obsidian tags.
 */

export type Segment = { globstar: true } | { globstar: false; re: RegExp };

function escapeRegExp(s: string): string {
	return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns null for a malformed pattern (an empty segment, e.g. a trailing slash). */
export function compilePattern(pattern: string): Segment[] | null {
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

/** Does the compiled pattern match this whole tag path (already split on "/")? */
export function matchesTag(segments: Segment[], tagPath: string[]): boolean {
	return matchSegments(segments, tagPath);
}

export interface PatternToken {
	negated: boolean;
	pattern: string;
}

/** Recognises `tag:#pat`, `tag:pat`, `#pat`, each optionally preceded by `-`, and only if pat has a `*`. */
export function parsePatternToken(token: string): PatternToken | null {
	const m = /^(-?)(?:tag:#?|#)(.+)$/i.exec(token);
	if (!m || !m[2].includes("*")) return null;
	return { negated: m[1] === "-", pattern: m[2] };
}

/**
 * A slice of a query. "word" parts are the only ones that can be tag patterns; everything else
 * (whitespace, parentheses, "quoted phrases", /regex/ literals) is "verbatim" and never touched.
 * Concatenating every part's text gives back the original query.
 */
export interface QueryPart {
	kind: "word" | "verbatim";
	text: string;
}

export function scanQuery(query: string): QueryPart[] {
	const parts: QueryPart[] = [];
	const n = query.length;
	let i = 0;

	while (i < n) {
		const ch = query[i];

		// Whitespace and grouping characters delimit tokens.
		if (/\s/.test(ch) || ch === "(" || ch === ")") {
			parts.push({ kind: "verbatim", text: ch });
			i++;
			continue;
		}

		// "quoted phrase"
		if (ch === '"') {
			const close = query.indexOf('"', i + 1);
			const stop = close === -1 ? n : close + 1;
			parts.push({ kind: "verbatim", text: query.slice(i, stop) });
			i = stop;
			continue;
		}

		// /regex/ literal at the start of a token
		if (ch === "/") {
			let j = i + 1;
			while (j < n && query[j] !== "/") j += query[j] === "\\" ? 2 : 1;
			const stop = Math.min(j + 1, n);
			parts.push({ kind: "verbatim", text: query.slice(i, stop) });
			i = stop;
			continue;
		}

		let j = i;
		while (j < n && !/[\s()"]/.test(query[j])) j++;
		parts.push({ kind: "word", text: query.slice(i, j) });
		i = j;
	}

	return parts;
}
