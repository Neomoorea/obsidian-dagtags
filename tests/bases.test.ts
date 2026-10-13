import { test } from "node:test";
import assert from "node:assert/strict";
import { filterByTerms, planBasesQuery } from "../src/bases-query";
import { expandQuery } from "../src/expand";

/** Notes by name, each with its tags (no leading "#"). */
type Notes = Record<string, string[]>;

/** Which notes does a Bases search for `query` keep? Only the DAGtags terms are applied here. */
function keep(query: string, notes: Notes): string[] {
	const plan = planBasesQuery(query);
	return filterByTerms(Object.keys(notes), plan.terms, (name) => notes[name]).kept;
}

const books: Notes = {
	one: ["A/B"],
	two: ["C/B"],
	deep: ["D/B/F"],
	root: ["B"],
	plain: [],
	other: ["A/x"],
};

test("a query without a wildcard is left alone", () => {
	for (const query of ["", "foo bar", "tag:#A/B", "#A/B"]) {
		const plan = planBasesQuery(query);
		assert.deepEqual(plan.terms, []);
		assert.deepEqual(plan.invalid, []);
		assert.equal(plan.residual, query);
	}
});

test("a lone pattern is extracted and leaves no residual text", () => {
	const plan = planBasesQuery("tag:#*/B");
	assert.equal(plan.terms.length, 1);
	assert.equal(plan.terms[0].token, "tag:#*/B");
	assert.equal(plan.terms[0].negated, false);
	assert.equal(plan.residual, "");
});

test("tag:#pat, tag:pat and a bare #pat are equivalent, and - negates", () => {
	for (const token of ["tag:#*/B", "tag:*/B", "#*/B"]) {
		assert.equal(planBasesQuery(token).terms.length, 1, token);
		assert.equal(planBasesQuery(`-${token}`).terms[0].negated, true, `-${token}`);
	}
});

test("everything that is not a pattern stays in the residual for Bases' own matcher", () => {
	const plan = planBasesQuery("year #*/B reading -tag:#x/* 2024");
	assert.deepEqual(
		plan.terms.map((t) => [t.token, t.negated]),
		[["#*/B", false], ["-tag:#x/*", true]],
	);
	assert.deepEqual(plan.residual.split(/\s+/), ["year", "reading", "2024"]);
});

test("quoted phrases and /regex/ literals are never read as patterns", () => {
	for (const query of ['"#*/B" foo', "/#*\\/B/", 'say "tag:#*/B"']) {
		const plan = planBasesQuery(query);
		assert.deepEqual(plan.terms, [], query);
		assert.equal(plan.residual, query);
	}
});

test("tokens that merely contain a star are not patterns", () => {
	for (const query of ["C#* notes", "foo*", "# heading", "5*3", "name:*draft"]) {
		assert.deepEqual(planBasesQuery(query).terms, [], query);
	}
});

test("a malformed pattern is reported, not guessed at, and stays in the residual", () => {
	const plan = planBasesQuery("tag:#*/B/");
	assert.deepEqual(plan.terms, []);
	assert.deepEqual(plan.invalid, ["tag:#*/B/"]);
	assert.equal(plan.residual, "tag:#*/B/");
});

test("a malformed pattern does not stop a valid one in the same query", () => {
	const plan = planBasesQuery("#*/B #*//C");
	assert.equal(plan.terms.length, 1);
	assert.deepEqual(plan.invalid, ["#*//C"]);
	assert.equal(plan.residual, "#*//C");
});

test("#*/B matches whole tags only: A/B and C/B, not D/B/F", () => {
	assert.deepEqual(keep("#*/B", books), ["one", "two"]);
});

test("#*/B/** also reaches below B, while #**/B also reaches a root B", () => {
	assert.deepEqual(keep("#*/B/**", books), ["one", "two", "deep"]);
	assert.deepEqual(keep("#**/B", books), ["one", "two", "root"]);
	assert.deepEqual(keep("#**/B/**", books), ["one", "two", "deep", "root"]);
});

test("a partial-segment wildcard stays inside one segment", () => {
	const notes: Notes = { a: ["project/B"], b: ["projects/B"], c: ["project/x/B"] };
	assert.deepEqual(keep("#proj*/B", notes), ["a", "b"]);
});

test("matching is case-insensitive", () => {
	assert.deepEqual(keep("#*/b", { n: ["A/B"] }), ["n"]);
	assert.deepEqual(keep("#A/*", { n: ["a/b"] }), ["n"]);
});

test("a note with several tags matches if any one of them does", () => {
	assert.deepEqual(keep("#*/B", { n: ["x", "A/B", "y"] }), ["n"]);
});

test("a negated pattern keeps every note without a matching tag, including untagged ones", () => {
	assert.deepEqual(keep("-#*/B", books), ["deep", "root", "plain", "other"]);
});

test("several patterns are combined with AND", () => {
	const notes: Notes = { both: ["A/B", "C/D"], onlyB: ["A/B"], onlyD: ["C/D"] };
	assert.deepEqual(keep("#*/B #*/D", notes), ["both"]);
	assert.deepEqual(keep("#*/B -#*/D", notes), ["onlyB"]);
});

test("hits report how many notes each pattern reached, ignoring negation", () => {
	const plan = planBasesQuery("#*/B -#*/zzz");
	const { hits } = filterByTerms(Object.keys(books), plan.terms, (name) => books[name]);
	assert.deepEqual(hits, [2, 0]);
});

// ---------------------------------------------------------------------------------------------
// Parity with the search pane. Bases and the search pane are two implementations of one language,
// so they must agree. The search pane's result comes from native `tag:#x`, which also returns
// descendants of x; Bases matches whole tags. So Bases must always be a subset of the search pane,
// and the two may differ only by notes reached through such descendants.
// ---------------------------------------------------------------------------------------------

/** Deterministic pseudo-random numbers, so a failure is reproducible. */
function lcg(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

/** What the search pane ends up returning: the notes native `tag:#x` finds for the expanded tags x. */
function searchPaneResult(pattern: string, notes: Notes): string[] {
	const universe = [...new Set(Object.values(notes).flat().map((t) => t.toLowerCase()))];
	const expanded = expandQuery(`tag:#${pattern}`, universe).expanded[0]?.tags ?? [];
	const nativeHit = (tag: string) =>
		expanded.some((x) => tag.toLowerCase() === x.toLowerCase() || tag.toLowerCase().startsWith(`${x.toLowerCase()}/`));
	return Object.keys(notes).filter((name) => notes[name].some(nativeHit));
}

test("parity: Bases is always a subset of the search pane, differing only by descendants", () => {
	const rand = lcg(20260612);
	const words = ["a", "b", "c", "fic", "fiction", "fi"];
	const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
	const patterns = ["*/b", "**/b", "**/b/**", "a/**", "fi*/**", "*/*", "**", "a/*/c", "*/fic*", "**/fiction/**", "b/*"];

	for (let round = 0; round < 200; round++) {
		const notes: Notes = {};
		for (let n = 0; n < 8; n++) {
			const tags: string[] = [];
			for (let t = Math.floor(rand() * 4); t > 0; t--) {
				const depth = 1 + Math.floor(rand() * 4);
				tags.push(Array.from({ length: depth }, () => pick(words)).join("/"));
			}
			notes[`n${n}`] = tags;
		}

		for (const pattern of patterns) {
			const bases = keep(`#${pattern}`, notes);
			const pane = searchPaneResult(pattern, notes);
			for (const name of bases) {
				assert.ok(pane.includes(name), `round ${round}: #${pattern} found ${name} in Bases but not in the search pane (${JSON.stringify(notes)})`);
			}
			for (const name of pane.filter((n) => !bases.includes(n))) {
				// Reached only through a descendant: none of its own tags matches the pattern as a whole tag.
				assert.deepEqual(keep(`#${pattern}`, { [name]: notes[name] }), [], `round ${round}: ${name}`);
			}
		}
	}
});

test("parity: a negated pattern is the exact complement of the positive one", () => {
	for (const pattern of ["*/B", "**/B/**", "proj*/x"]) {
		const positive = keep(`#${pattern}`, books);
		const negative = keep(`-#${pattern}`, books);
		assert.deepEqual([...positive, ...negative].sort(), Object.keys(books).sort());
		assert.deepEqual(positive.filter((n) => negative.includes(n)), []);
	}
});
