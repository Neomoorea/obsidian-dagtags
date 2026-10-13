import esbuild from "esbuild";

// Pure logic: no Obsidian involved.
for (const name of ["expand", "bases"]) {
	await esbuild.build({
		entryPoints: [`tests/${name}.test.ts`],
		bundle: true,
		platform: "node",
		outfile: `.test-build/${name}.test.js`,
		logLevel: "warning",
	});
}

// Everything that imports the plugin is tested against a mocked `obsidian` module.
for (const name of ["glue", "bases-glue"]) {
	await esbuild.build({
		entryPoints: [`tests/${name}.test.ts`],
		bundle: true,
		platform: "node",
		alias: { obsidian: "./tests/obsidian-mock.ts" },
		external: ["jsdom"],
		outfile: `.test-build/${name}.test.js`,
		logLevel: "warning",
	});
}
