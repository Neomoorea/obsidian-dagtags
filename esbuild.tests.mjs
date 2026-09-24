import esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["tests/expand.test.ts"],
	bundle: true,
	platform: "node",
	outfile: ".test-build/expand.test.js",
	logLevel: "warning",
});

// The plugin entry point is tested against a mocked `obsidian` module and a simulated DOM.
await esbuild.build({
	entryPoints: ["tests/glue.test.ts"],
	bundle: true,
	platform: "node",
	alias: { obsidian: "./tests/obsidian-mock.ts" },
	external: ["jsdom"],
	outfile: ".test-build/glue.test.js",
	logLevel: "warning",
});
