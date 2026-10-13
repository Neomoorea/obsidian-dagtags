import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { QueryController, notices } from "./obsidian-mock";
import { nativeApplySearchQuery } from "./native-bases-search";
import { makeVault, paths } from "./fixtures";
import { installBasesSearch } from "../src/bases-search";
import { IssueReporter } from "../src/issues";
import Plugin from "../src/main";

const proto = QueryController.prototype as any;
const VISIBLE = ["name", "status"];

const vault = makeVault({
	"one.md": { tags: ["#A/B"], props: { name: "Book One", status: "reading" } },
	"two.md": { tags: ["#C/B"], props: { name: "Book Two", status: "done" } },
	"deep.md": { tags: ["#D/B/F"], props: { name: "Deep", status: "reading" } },
	"plain.md": { props: { name: "Plain note", status: "reading" } },
	"fm.md": { frontmatter: ["X/B"], props: { name: "Frontmatter", status: "done" } },
});

/** Stands in for a QueryController instance: the search bar's text lives in `searchQuery`. */
const search = (query: string | null, entries = vault.entries) => {
	const host = { searchQuery: query };
	const result = proto.applySearchQuery.call(host, entries, VISIBLE);
	return { names: paths(result), host };
};

let uninstall: (() => void) | null = null;
let reporter: IssueReporter;

beforeEach(() => {
	notices.length = 0;
	reporter = new IssueReporter(vault.app as any);
	proto.applySearchQuery = nativeApplySearchQuery;
	uninstall = installBasesSearch(vault.app as any, reporter);
});

afterEach(() => {
	uninstall?.();
	reporter.dispose();
	mock.timers.reset();
	mock.restoreAll();
	proto.applySearchQuery = nativeApplySearchQuery;
});

test("installs a wrapper, and uninstalling puts the original method back", () => {
	assert.notEqual(proto.applySearchQuery, nativeApplySearchQuery);
	uninstall!();
	uninstall = null;
	assert.equal(proto.applySearchQuery, nativeApplySearchQuery);
});

test("queries without a wildcard behave exactly like native Bases search", () => {
	assert.deepEqual(search("reading").names, ["one.md", "deep.md", "plain.md"]);
	assert.deepEqual(search("book").names, ["one.md", "two.md"]);
	assert.deepEqual(search(null).names, vault.files.map((f) => f.path));
	assert.deepEqual(search("").names, vault.files.map((f) => f.path));
});

test("#*/B keeps notes with a tag such as A/B or C/B, inline or in frontmatter", () => {
	assert.deepEqual(search("#*/B").names, ["one.md", "two.md", "fm.md"]);
});

test("tag:#*/B and tag:*/B behave like #*/B", () => {
	assert.deepEqual(search("tag:#*/B").names, search("#*/B").names);
	assert.deepEqual(search("tag:*/B").names, search("#*/B").names);
});

test("#*/B/** also reaches D/B/F", () => {
	assert.deepEqual(search("#*/B/**").names, ["one.md", "two.md", "deep.md", "fm.md"]);
});

test("a pattern combines with native text matching: both must hold", () => {
	assert.deepEqual(search("#*/B reading").names, ["one.md"]);
	assert.deepEqual(search("done #*/B").names, ["two.md", "fm.md"]);
	assert.deepEqual(search("#*/B/** reading").names, ["one.md", "deep.md"]);
});

test("a negated pattern excludes the notes it reaches", () => {
	assert.deepEqual(search("-#*/B").names, ["deep.md", "plain.md"]);
	assert.deepEqual(search("-#*/B reading").names, ["deep.md", "plain.md"]);
});

test("a pattern that matches nothing shows nothing", () => {
	assert.deepEqual(search("#*/zzz").names, []);
});

test("a malformed pattern goes to the native matcher untouched, so it finds nothing", () => {
	assert.deepEqual(search("#*/B/").names, []);
});

test("the search bar's own text is restored after every call", () => {
	assert.equal(search("#*/B reading").host.searchQuery, "#*/B reading");
	assert.equal(search("reading").host.searchQuery, "reading");
	assert.equal(search(null).host.searchQuery, null);
});

test("the search bar's own text is restored even when the native method throws", () => {
	uninstall!();
	proto.applySearchQuery = function () { throw new Error("native failure"); };
	uninstall = installBasesSearch(vault.app as any, reporter);

	const host = { searchQuery: "#*/B" };
	assert.throws(() => proto.applySearchQuery.call(host, vault.entries, VISIBLE), /native failure/);
	assert.equal(host.searchQuery, "#*/B");
});

test("a failure of our own falls back to native search instead of breaking Bases", () => {
	const error = mock.method(console, "error", () => {});
	const broken = {
		...vault.app,
		metadataCache: { getFileCache: () => { throw new Error("cache unavailable"); } },
	};
	uninstall!();
	uninstall = installBasesSearch(broken as any, reporter);

	// Native alone cannot understand the wildcard, so it finds nothing, but it must not throw.
	assert.deepEqual(search("#*/B").names, []);
	assert.deepEqual(search("reading").names, ["one.md", "deep.md", "plain.md"]);
	assert.equal(error.mock.callCount(), 1, "the failure is logged once, not on every keystroke");
});

test("an unrecognised Obsidian (no search method to wrap) is left alone", () => {
	uninstall!();
	delete proto.applySearchQuery;
	const warn = mock.method(console, "warn", () => {});

	uninstall = installBasesSearch(vault.app as any, reporter);
	assert.equal(uninstall, null);
	assert.equal(proto.applySearchQuery, undefined);
	assert.equal(warn.mock.callCount(), 1);
});

test("after unloading, the wrapper is inert even if another plugin wrapped it afterwards", () => {
	const ours = proto.applySearchQuery;
	const theirs = function (this: any, ...args: any[]) { return ours.apply(this, args); };
	proto.applySearchQuery = theirs;

	uninstall!();
	uninstall = null;

	assert.equal(proto.applySearchQuery, theirs, "we must not clobber the later wrapper");
	assert.deepEqual(search("reading").names, ["one.md", "deep.md", "plain.md"]);
	assert.deepEqual(search("#*/B").names, [], "wildcards are no longer interpreted once unloaded");
});

test("reinstalling after an unload works", () => {
	uninstall!();
	uninstall = installBasesSearch(vault.app as any, reporter);
	assert.deepEqual(search("#*/B").names, ["one.md", "two.md", "fm.md"]);
});

// --- Notices: the search runs on every keystroke, so reports must be debounced and not repeat ---

test("a pattern that no tag in the vault fits is reported once the user pauses", () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	search("#*/zzz");
	assert.deepEqual(notices, [], "nothing while the user may still be typing");
	mock.timers.tick(800);
	assert.deepEqual(notices, ["DAGtags: no tag matches #*/zzz"]);
});

test("it is not reported again while the same problem persists, but is after it was fixed", () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	search("#*/zzz");
	mock.timers.tick(800);
	search("#*/zzz");
	mock.timers.tick(800);
	assert.equal(notices.length, 1);

	search("#*/B");
	mock.timers.tick(800);
	search("#*/zzz");
	mock.timers.tick(800);
	assert.equal(notices.length, 2);
});

test("a half-typed pattern that is fixed within the delay is never reported", () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	search("#*/");
	mock.timers.tick(300);
	search("#*/B");
	mock.timers.tick(2000);
	assert.deepEqual(notices, []);
});

test("a malformed pattern is reported once the user pauses", () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	search("#*/B/");
	mock.timers.tick(800);
	assert.equal(notices.length, 1);
	assert.match(notices[0], /malformed pattern #\*\/B\//);
});

test("no report when the pattern exists in the vault but not in this particular view", () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	const onlyPlain = vault.entries.filter((e) => e.file.path === "plain.md");
	search("#*/B", onlyPlain);
	mock.timers.tick(2000);
	assert.deepEqual(notices, []);
});

test("clearing the search discards a pending report", () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	search("#*/zzz");
	search("");
	mock.timers.tick(2000);
	assert.deepEqual(notices, []);
});

// --- The plugin itself ---

test("the plugin installs the Bases support on load and removes it on unload", async () => {
	uninstall!();
	uninstall = null;
	(globalThis as any).document = { addEventListener() {} };
	(globalThis as any).__app = vault.app;

	const plugin: any = new (Plugin as any)();
	await plugin.onload();
	assert.notEqual(proto.applySearchQuery, nativeApplySearchQuery);
	assert.deepEqual(search("#*/B").names, ["one.md", "two.md", "fm.md"]);

	plugin.unload();
	assert.equal(proto.applySearchQuery, nativeApplySearchQuery);
});
