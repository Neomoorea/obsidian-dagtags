import { test } from "node:test";
import assert from "node:assert/strict";
import { expandQuery } from "../src/expand";

const vault = ["A/B", "C/B", "D/B/F", "personal", "work/personal", "work/personal-stuff", "work/personal/x", "personalities"];
const q = (query: string, tags: string[] = vault) => expandQuery(query, tags).query;

test("scenario 1: #*/B reaches A/B and C/B only", () => {
	assert.equal(q("tag:#*/B", ["A/B", "C/B", "D/B/F"]), "(tag:#A/B OR tag:#C/B)");
});

test("scenario 2: #*/B/** also reaches D/B/F", () => {
	assert.equal(q("tag:#*/B/**", ["A/B", "C/B", "D/B/F"]), "(tag:#A/B OR tag:#C/B OR tag:#D/B/F)");
});

test("#**/personal matches at any depth, including root, and nothing looser", () => {
	// "personal" is not an ancestor of "work/personal", so both survive de-duplication.
	assert.equal(q("tag:#**/personal"), "(tag:#personal OR tag:#work/personal)");
});

test("the original regex bug: personal\\b would also match personal-stuff; the glob does not", () => {
	const r = expandQuery("tag:#**/personal", vault);
	assert.ok(!r.query.includes("personal-stuff"));
	assert.ok(!r.query.includes("personalities"));
	assert.ok(!r.query.includes("personal/x"));
});

test("bare #pattern and tag:pattern (no hash) both work", () => {
	assert.equal(q("#*/B", ["A/B", "C/B"]), "(tag:#A/B OR tag:#C/B)");
	assert.equal(q("tag:*/B", ["A/B", "C/B"]), "(tag:#A/B OR tag:#C/B)");
});

test("single match needs no parentheses", () => {
	assert.equal(q("tag:#D/*/F", vault), "tag:#D/B/F");
});

test("negation is distributed (De Morgan) instead of relying on -( ... )", () => {
	assert.equal(q("-tag:#*/B", ["A/B", "C/B"]), "-tag:#A/B -tag:#C/B");
});

test("descendants of an already matched tag are dropped", () => {
	assert.equal(q("tag:#A/**", ["A/B", "A/B/F", "A/G"]), "(tag:#A/B OR tag:#A/G)");
});

test("partial-segment wildcard stays inside one segment", () => {
	assert.equal(q("tag:#proj*/B", ["project/B", "projects/B", "project/x/B"]), "(tag:#project/B OR tag:#projects/B)");
});

test("matching is case-insensitive", () => {
	assert.equal(q("tag:#*/b", ["A/B"]), "tag:#A/B");
});

test("surrounding query is preserved, including groups and OR", () => {
	assert.equal(q("foo tag:#*/B -bar", ["A/B", "C/B"]), "foo (tag:#A/B OR tag:#C/B) -bar");
	assert.equal(q("(tag:#*/B OR tag:#x)", ["A/B", "C/B"]), "((tag:#A/B OR tag:#C/B) OR tag:#x)");
});

test("quoted phrases and /regex/ literals are left alone", () => {
	assert.equal(q('"#*/B" foo', ["A/B"]), '"#*/B" foo');
	assert.equal(q("/#*\\/B/", ["A/B"]), "/#*\\/B/");
});

test("no match: query unchanged, token reported", () => {
	const r = expandQuery("tag:#*/nope", vault);
	assert.equal(r.query, "tag:#*/nope");
	assert.deepEqual(r.unmatched, ["tag:#*/nope"]);
});

test("trailing slash is rejected as malformed rather than guessed", () => {
	const r = expandQuery("tag:#*/B/", vault);
	assert.equal(r.query, "tag:#*/B/");
	assert.deepEqual(r.invalid, ["tag:#*/B/"]);
});

test("queries without a wildcard token are untouched", () => {
	assert.equal(q("tag:#A/B"), "tag:#A/B");
	assert.equal(q("C#* notes"), "C#* notes");
	assert.equal(q("foo*"), "foo*");
	assert.equal(q("# heading"), "# heading");
});
